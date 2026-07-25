import { get } from 'svelte/store';
import { togetherStore } from '../stores/togetherStore.js';
import { videoElement as videoElementStore, currentEpisodeStore } from '../stores/playerStore.js';

export class SyncEngine {
    constructor(p2pClient, options = {}) {
        this.p2pClient = p2pClient;
        this.options = options;

        this.videoElement = options.videoElement || null;
        this.isRemoteActionExecuting = false;
        this.pingInterval = null;
        this.rtt = 0;
        this.guestBufferingMap = new Map();
        this.autoPausedByGuestBuffering = false;
        this.isSmoothingDrift = false;
        this.lastSyncState = null;

        this.unsubscribeP2PMessage = null;
        this.unsubscribeP2PState = null;
        this.unsubscribeVideoStore = null;
        this.boundHandlers = {};

        this.init();
    }

    init() {
        if (this.p2pClient) {
            this.unsubscribeP2PMessage = this.p2pClient.onMessage((msg) => this.handleMessage(msg));
            this.unsubscribeP2PState = this.p2pClient.onStateChange((state) => {
                togetherStore.setConnectionState(state);
            });
        }

        // Subscribe to playerStore's videoElement if available
        if (videoElementStore && typeof videoElementStore.subscribe === 'function') {
            this.unsubscribeVideoStore = videoElementStore.subscribe((el) => {
                if (el && el !== this.videoElement) {
                    this.attachVideo(el);
                }
            });
        }

        if (this.videoElement) {
            this.attachVideo(this.videoElement);
        }

        this.startPingInterval();
    }

    attachVideo(videoElement) {
        if (this.videoElement === videoElement && this.boundHandlers.play) return;
        this.detachVideo();

        this.videoElement = videoElement;
        if (!this.videoElement) return;

        this.boundHandlers = {
            play: () => this.handleLocalPlay(),
            pause: () => this.handleLocalPause(),
            seeked: () => this.handleLocalSeeked(),
            waiting: () => this.handleLocalWaiting(),
            stalled: () => this.handleLocalWaiting(),
            playing: () => this.handleLocalPlaying(),
            canplay: () => this.handleLocalPlaying(),
            timeupdate: () => this.handleLocalTimeUpdate()
        };

        for (const [evt, handler] of Object.entries(this.boundHandlers)) {
            this.videoElement.addEventListener(evt, handler);
        }
    }

    detachVideo() {
        if (this.videoElement && this.boundHandlers) {
            for (const [evt, handler] of Object.entries(this.boundHandlers)) {
                this.videoElement.removeEventListener(evt, handler);
            }
        }
        this.boundHandlers = {};
        this.videoElement = null;
    }

    startPingInterval() {
        this.stopPingInterval();
        this.pingInterval = setInterval(() => {
            this.sendPing();
        }, 3000);
    }

    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    sendPing() {
        if (this.p2pClient) {
            this.p2pClient.send({
                type: 'PING',
                timestamp: Date.now(),
                senderId: this.getPeerId()
            });
        }
    }

    isHost() {
        const storeState = get(togetherStore);
        return !!storeState.isHost;
    }

    getPeerId() {
        const storeState = get(togetherStore);
        return storeState.peerId || (this.p2pClient && this.p2pClient.peerId) || 'unknown';
    }

    getUserName() {
        const storeState = get(togetherStore);
        const me = storeState.participants.find((p) => p.id === storeState.peerId);
        return me ? me.name : (storeState.isHost ? 'Host' : 'Guest');
    }

    getEpisodeId() {
        const storeState = get(togetherStore);
        if (storeState.currentEpisodeId !== null && storeState.currentEpisodeId !== undefined) {
            return storeState.currentEpisodeId;
        }
        if (currentEpisodeStore && typeof currentEpisodeStore.subscribe === 'function') {
            const epState = get(currentEpisodeStore);
            return epState ? (typeof epState === 'object' ? epState.id : epState) : null;
        }
        return null;
    }

    handleMessage(data) {
        let msg = data;
        if (typeof data === 'string') {
            try {
                msg = JSON.parse(data);
            } catch (e) {
                return;
            }
        }
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'PING':
                this.handlePing(msg);
                break;
            case 'PONG':
                this.handlePong(msg);
                break;
            case 'STATE_SYNC':
            case 'PLAYER_COMMAND':
                if (!this.isHost()) {
                    this.handleRemoteStateSync(msg);
                }
                break;
            case 'BUFFER_STATUS':
                if (this.isHost()) {
                    this.handleGuestBufferStatus(msg);
                }
                break;
            case 'CHAT_MESSAGE':
                togetherStore.addChatMessage(msg.payload || msg);
                break;
            case 'EMOTE_REACTION':
                togetherStore.addReaction(msg.payload || msg);
                break;
            default:
                break;
        }
    }

    handlePing(msg) {
        const origTimestamp = msg.timestamp || (msg.payload && msg.payload.timestamp);
        if (this.p2pClient && origTimestamp) {
            this.p2pClient.send({
                type: 'PONG',
                originalTimestamp: origTimestamp,
                senderId: this.getPeerId()
            });
        }
    }

    handlePong(msg) {
        const origTimestamp = msg.originalTimestamp || (msg.payload && msg.payload.originalTimestamp);
        if (origTimestamp) {
            const measuredRtt = Date.now() - origTimestamp;
            this.rtt = this.rtt ? Math.round(0.8 * this.rtt + 0.2 * measuredRtt) : measuredRtt;
            togetherStore.setRtt(this.rtt);
        }
    }

    broadcastHostState(action, extraPayload = {}) {
        if (this.isRemoteActionExecuting) return;
        if (!this.isHost()) return;
        if (!this.videoElement && action !== 'episodeChange') return;

        const payload = {
            type: 'STATE_SYNC',
            action: action,
            currentTime: this.videoElement ? (this.videoElement.currentTime || 0) : 0,
            isPaused: this.videoElement ? this.videoElement.paused : false,
            episodeId: extraPayload.episodeId !== undefined ? extraPayload.episodeId : this.getEpisodeId(),
            releaseId: this.options.releaseId || null,
            timestamp: Date.now(),
            ...extraPayload
        };

        if (this.p2pClient) {
            this.p2pClient.send(payload);
        }
    }

    handleLocalPlay() {
        if (this.isRemoteActionExecuting) return;
        if (this.isHost()) {
            this.broadcastHostState('play');
        }
    }

    handleLocalPause() {
        if (this.isRemoteActionExecuting) return;
        if (this.isHost()) {
            this.broadcastHostState('pause');
        }
    }

    handleLocalSeeked() {
        if (this.isRemoteActionExecuting) return;
        if (this.isHost()) {
            this.broadcastHostState('seek');
        }
    }

    handleLocalWaiting() {
        if (this.isRemoteActionExecuting) return;
        if (!this.isHost() && this.p2pClient) {
            this.p2pClient.send({
                type: 'BUFFER_STATUS',
                isBuffering: true,
                senderId: this.getPeerId(),
                senderName: this.getUserName()
            });
        }
    }

    handleLocalPlaying() {
        if (this.isRemoteActionExecuting) return;
        if (!this.isHost() && this.p2pClient) {
            this.p2pClient.send({
                type: 'BUFFER_STATUS',
                isBuffering: false,
                senderId: this.getPeerId(),
                senderName: this.getUserName()
            });
        }
    }

    handleLocalTimeUpdate() {
        if (this.isHost() || !this.videoElement || !this.lastSyncState) return;
        if (this.videoElement.paused) return;

        const now = Date.now();
        const elapsed = (now - this.lastSyncState.timestamp) / 1000;
        const estimatedTarget = this.lastSyncState.currentTime + (this.lastSyncState.isPaused ? 0 : elapsed);
        const localTime = this.videoElement.currentTime || 0;
        const delta = Math.abs(localTime - estimatedTarget);

        if (this.isSmoothingDrift || (delta >= 0.6 && delta <= 3.0)) {
            if (delta < 0.2) {
                this.videoElement.playbackRate = 1.0;
                this.isSmoothingDrift = false;
            } else if (delta <= 3.0) {
                if (localTime < estimatedTarget) {
                    this.videoElement.playbackRate = 1.05;
                } else {
                    this.videoElement.playbackRate = 0.95;
                }
                this.isSmoothingDrift = true;
            } else if (delta > 3.0) {
                this.isRemoteActionExecuting = true;
                this.videoElement.currentTime = estimatedTarget;
                this.videoElement.playbackRate = 1.0;
                this.isSmoothingDrift = false;
                setTimeout(() => {
                    this.isRemoteActionExecuting = false;
                }, 0);
            }
        }
    }

    handleRemoteStateSync(msg) {
        if (!this.videoElement) return;
        const payload = msg.payload || msg;
        const { action, currentTime, episodeId, isPaused } = payload;

        this.isRemoteActionExecuting = true;

        try {
            const remoteTime = typeof currentTime === 'number' ? currentTime : 0;
            const targetTime = remoteTime + (action === 'play' ? (this.rtt / 2000) : 0);
            const localTime = this.videoElement.currentTime || 0;
            const deltaTime = Math.abs(localTime - targetTime);

            if (action === 'episodeChange' && episodeId !== undefined && episodeId !== null) {
                togetherStore.setCurrentEpisodeId(episodeId);
            }

            const isExplicitSeek = (action === 'seek' || action === 'episodeChange' || action === 'skipIntro');

            if (deltaTime > 3.0 || isExplicitSeek) {
                this.videoElement.currentTime = targetTime;
                this.videoElement.playbackRate = 1.0;
                this.isSmoothingDrift = false;
            } else if (action === 'play' && deltaTime >= 0.6 && deltaTime <= 3.0) {
                if (localTime < targetTime) {
                    this.videoElement.playbackRate = 1.05;
                } else {
                    this.videoElement.playbackRate = 0.95;
                }
                this.isSmoothingDrift = true;
            } else if (deltaTime < 0.2) {
                this.videoElement.playbackRate = 1.0;
                this.isSmoothingDrift = false;
            }

            if (action === 'pause' || isPaused) {
                if (!this.videoElement.paused) {
                    this.videoElement.pause();
                }
                this.videoElement.playbackRate = 1.0;
                this.isSmoothingDrift = false;
            } else if (action === 'play' || (!isPaused && action !== 'pause')) {
                if (this.videoElement.paused) {
                    const playPromise = this.videoElement.play();
                    if (playPromise && playPromise.catch) {
                        playPromise.catch((err) => console.warn('SyncEngine play failed:', err));
                    }
                }
            }

            this.lastSyncState = {
                action,
                currentTime: targetTime,
                timestamp: Date.now(),
                isPaused: action === 'pause' || isPaused,
                episodeId
            };
        } finally {
            setTimeout(() => {
                this.isRemoteActionExecuting = false;
            }, 0);
        }
    }

    handleGuestBufferStatus(msg) {
        if (!this.isHost()) return;
        const payload = msg.payload || msg;
        const senderId = msg.senderId || payload.senderId || 'guest';
        const isBuffering = !!payload.isBuffering;
        const senderName = payload.senderName || payload.name || 'Guest';

        this.guestBufferingMap.set(senderId, { isBuffering, name: senderName });

        let anyBuffering = false;
        let bufferingName = null;

        for (const info of this.guestBufferingMap.values()) {
            if (info.isBuffering) {
                anyBuffering = true;
                bufferingName = info.name;
                break;
            }
        }

        if (anyBuffering) {
            togetherStore.setBufferingState(true, bufferingName);
            if (this.videoElement && !this.videoElement.paused) {
                this.isRemoteActionExecuting = true;
                this.videoElement.pause();
                this.autoPausedByGuestBuffering = true;
                setTimeout(() => {
                    this.isRemoteActionExecuting = false;
                }, 0);
            }
        } else {
            togetherStore.setBufferingState(false, null);
            if (this.autoPausedByGuestBuffering) {
                this.autoPausedByGuestBuffering = false;
                if (this.videoElement && this.videoElement.paused) {
                    this.isRemoteActionExecuting = true;
                    const p = this.videoElement.play();
                    if (p && p.catch) p.catch(() => {});
                    setTimeout(() => {
                        this.isRemoteActionExecuting = false;
                    }, 0);
                    this.broadcastHostState('play');
                }
            }
        }
    }

    notifyEpisodeChange(episodeId) {
        togetherStore.setCurrentEpisodeId(episodeId);
        if (this.isHost()) {
            this.broadcastHostState('episodeChange', { episodeId });
        }
    }

    notifySkipIntro(skipDuration = 85) {
        if (this.isHost() && this.videoElement) {
            this.isRemoteActionExecuting = true;
            this.videoElement.currentTime += skipDuration;
            setTimeout(() => {
                this.isRemoteActionExecuting = false;
            }, 0);
            this.broadcastHostState('skipIntro', { skipDuration });
        }
    }

    destroy() {
        this.stopPingInterval();
        this.detachVideo();

        if (typeof this.unsubscribeP2PMessage === 'function') {
            this.unsubscribeP2PMessage();
            this.unsubscribeP2PMessage = null;
        }
        if (typeof this.unsubscribeP2PState === 'function') {
            this.unsubscribeP2PState();
            this.unsubscribeP2PState = null;
        }
        if (typeof this.unsubscribeVideoStore === 'function') {
            this.unsubscribeVideoStore();
            this.unsubscribeVideoStore = null;
        }

        this.guestBufferingMap.clear();
        this.lastSyncState = null;
    }
}

export default SyncEngine;
