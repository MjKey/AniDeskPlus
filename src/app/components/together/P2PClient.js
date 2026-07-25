import { SignalingAdapter, compressSdpToken, decompressSdpToken } from './SignalingAdapter.js';

/**
 * P2PClient Class
 * WebRTC RTCPeerConnection manager with 4-level failover cascade:
 * (1) WebRTC P2P DataChannel via MQTT public broker pool signaling
 * (2) Base64 compressed SDP token copy-paste mode
 * (3) LAN peer discovery via togetherAPI
 * (4) Direct MQTT Data Relay Fallback (anideskplus/together/room/<ROOM_CODE>/relay)
 */
export class P2PClient {
  constructor(options = {}) {
    this.options = options;
    this.peerId = options.peerId || 'peer_' + Math.random().toString(36).substr(2, 9);
    this.roomCode = null;
    this.isHost = false;

    this.pc = null;
    this.dataChannel = null;
    this.signaling = new SignalingAdapter({ peerId: this.peerId, brokers: options.brokers });

    this.state = 'disconnected'; // 'disconnected' | 'connecting' | 'connected-p2p' | 'connected-relay'
    
    this.messageHandlers = new Set();
    this.stateHandlers = new Set();
    this.lanPeerHandlers = new Set();

    this.pendingCandidates = [];
    this.fallbackTimer = null;
    this.lanDiscoveryActive = false;

    this.iceServers = options.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ];
  }

  /**
   * Primary entry point: Connect to room
   */
  async connect(roomCode, isHost = false) {
    this.roomCode = roomCode;
    this.isHost = isHost;
    this._setState('connecting');

    // Reset PC & state
    this._cleanupPeerConnection();

    // 1. Initialize SignalingAdapter and MQTT connection
    this.signaling.onSignal((signal) => this._handleRemoteSignal(signal));
    this.signaling.onRelay((relayData) => this._handleRelayMessage(relayData));
    this.signaling.onLanPeer((peer) => this._handleLanPeer(peer));

    // 2. Start LAN Discovery
    this.signaling.startLanDiscovery(roomCode, this.peerId, this.options.nickname || '');
    this.lanDiscoveryActive = true;

    // 3. Setup RTCPeerConnection
    this._initPeerConnection();

    // 4. Start Signaling MQTT Connection
    try {
      await this.signaling.connect(roomCode, this.peerId);
    } catch (err) {
      console.warn('MQTT signaling connection failed, relying on LAN/SDP tokens or retrying:', err);
    }

    // 5. Initiate WebRTC Offer or Join request
    if (this.isHost) {
      this._createHostOffer();
    } else {
      // Send join request to trigger host to send offer
      this.signaling.sendSignal({ type: 'join', senderId: this.peerId });
    }

    // 6. Set Fallback Timer (8 seconds) for Direct MQTT Relay if WebRTC P2P fails or times out
    this._startFallbackTimer(8000);
  }

  _initPeerConnection() {
    try {
      this.pc = new RTCPeerConnection({ iceServers: this.iceServers });

      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.signaling.sendSignal({
            type: 'candidate',
            candidate: event.candidate,
            senderId: this.peerId
          });
        }
      };

      this.pc.oniceconnectionstatechange = () => {
        if (!this.pc) return;
        const iceState = this.pc.iceConnectionState;
        if (iceState === 'failed' || iceState === 'disconnected') {
          console.warn(`ICE connection state ${iceState}, initiating MQTT relay fallback...`);
          this._triggerRelayFallback(`ICE state: ${iceState}`);
        }
      };

      if (this.isHost) {
        this.dataChannel = this.pc.createDataChannel('together-data', { ordered: true });
        this._setupDataChannel(this.dataChannel);
      } else {
        this.pc.ondatachannel = (event) => {
          if (event.channel && event.channel.label === 'together-data') {
            this.dataChannel = event.channel;
            this._setupDataChannel(this.dataChannel);
          }
        };
      }
    } catch (err) {
      console.error('Failed to create RTCPeerConnection:', err);
      this._triggerRelayFallback('RTCPeerConnection initialization failed');
    }
  }

  _setupDataChannel(channel) {
    channel.onopen = () => {
      this._clearFallbackTimer();
      this._setState('connected-p2p');
    };

    channel.onmessage = (event) => {
      this._emitMessage(event.data);
    };

    channel.onclose = () => {
      if (this.state === 'connected-p2p') {
        console.warn('P2P DataChannel closed, falling back to MQTT relay...');
        this._triggerRelayFallback('DataChannel closed');
      }
    };

    channel.onerror = (err) => {
      console.warn('P2P DataChannel error:', err);
    };
  }

  async _createHostOffer() {
    if (!this.pc) return;
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.signaling.sendSignal({
        type: 'offer',
        sdp: offer.sdp,
        senderId: this.peerId
      });
    } catch (err) {
      console.error('Failed to create host offer:', err);
    }
  }

  async _handleRemoteSignal(signal) {
    if (!signal || !this.pc) return;

    try {
      if (signal.type === 'join' && this.isHost) {
        if (this.pc.localDescription) {
          this.signaling.sendSignal({
            type: 'offer',
            sdp: this.pc.localDescription.sdp,
            senderId: this.peerId
          });
        } else {
          this._createHostOffer();
        }
      } else if (signal.type === 'offer' && !this.isHost) {
        await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
        this._drainPendingCandidates();

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        this.signaling.sendSignal({
          type: 'answer',
          sdp: answer.sdp,
          senderId: this.peerId
        });
      } else if (signal.type === 'answer' && this.isHost) {
        if (this.pc.signalingState !== 'stable') {
          await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
          this._drainPendingCandidates();
        }
      } else if (signal.type === 'candidate') {
        const candidate = new RTCIceCandidate(signal.candidate);
        if (this.pc.remoteDescription && this.pc.remoteDescription.type) {
          await this.pc.addIceCandidate(candidate);
        } else {
          this.pendingCandidates.push(candidate);
        }
      }
    } catch (err) {
      console.error('Error handling remote signal:', err);
    }
  }

  async _drainPendingCandidates() {
    while (this.pendingCandidates.length > 0) {
      const cand = this.pendingCandidates.shift();
      try {
        await this.pc.addIceCandidate(cand);
      } catch (e) {
        console.warn('Failed to add queued candidate:', e);
      }
    }
  }

  /**
   * Base64 SDP Token Copy-Paste Mode
   */
  async generateSdpToken() {
    if (!this.pc) {
      this._initPeerConnection();
    }
    if (!this.pc.localDescription) {
      if (this.isHost) {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
      } else {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
      }
    }

    // Small delay to collect initial ICE candidates into local SDP
    await new Promise((res) => setTimeout(res, 300));

    return compressSdpToken({
      type: this.pc.localDescription.type,
      sdp: this.pc.localDescription.sdp
    });
  }

  async acceptSdpToken(token) {
    const decompressed = decompressSdpToken(token);
    if (!decompressed) {
      throw new Error('Invalid SDP token');
    }

    if (!this.pc) {
      this._initPeerConnection();
    }

    if (decompressed.type === 'offer') {
      await this.pc.setRemoteDescription(new RTCSessionDescription(decompressed));
      this._drainPendingCandidates();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // Return answer token so caller can copy-paste back to host
      await new Promise((res) => setTimeout(res, 300));
      return compressSdpToken({
        type: 'answer',
        sdp: answer.sdp
      });
    } else if (decompressed.type === 'answer') {
      await this.pc.setRemoteDescription(new RTCSessionDescription(decompressed));
      this._drainPendingCandidates();
      return null;
    }
  }

  _handleLanPeer(peer) {
    for (const handler of this.lanPeerHandlers) {
      handler(peer);
    }
  }

  _handleRelayMessage(relayData) {
    if (!relayData) return;
    const msg = relayData.payload !== undefined ? relayData.payload : relayData;
    this._emitMessage(msg);
  }

  /**
   * 4-Level Fallback: Direct MQTT Data Relay
   */
  _triggerRelayFallback(reason) {
    if (this.state === 'connected-p2p') return;

    if (this.signaling && this.signaling.isConnected) {
      this._clearFallbackTimer();
      this._setState('connected-relay');
    } else {
      // Try to maintain relay state if signaling reaches connected state
      this._setState('connected-relay');
    }
  }

  _startFallbackTimer(ms = 8000) {
    this._clearFallbackTimer();
    this.fallbackTimer = setTimeout(() => {
      if (this.state === 'connecting') {
        console.warn(`WebRTC P2P connection timeout (${ms}ms). Falling back to MQTT Data Relay.`);
        this._triggerRelayFallback('Timeout');
      }
    }, ms);
  }

  _clearFallbackTimer() {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  /**
   * Transmit message via DataChannel (if open) or MQTT Relay Fallback
   */
  send(message) {
    const payloadStr = typeof message === 'string' ? message : JSON.stringify(message);

    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(payloadStr);
      return true;
    } else if (this.state === 'connected-relay' || (this.signaling && this.signaling.isConnected)) {
      return this.signaling.sendRelay(message);
    } else {
      console.warn('Unable to send message: no open P2P channel or MQTT relay available.');
      return false;
    }
  }

  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStateChange(handler) {
    this.stateHandlers.add(handler);
    // Immediately inform subscriber of current state
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
  }

  onLanPeer(handler) {
    this.lanPeerHandlers.add(handler);
    return () => this.lanPeerHandlers.delete(handler);
  }

  _setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      for (const handler of this.stateHandlers) {
        handler(this.state);
      }
    }
  }

  _emitMessage(data) {
    let parsed = data;
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        parsed = data;
      }
    }
    for (const handler of this.messageHandlers) {
      handler(parsed);
    }
  }

  _cleanupPeerConnection() {
    if (this.dataChannel) {
      this.dataChannel.onopen = null;
      this.dataChannel.onmessage = null;
      this.dataChannel.onclose = null;
      this.dataChannel.onerror = null;
      try { this.dataChannel.close(); } catch (e) {}
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.ondatachannel = null;
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }
    this.pendingCandidates = [];
  }

  disconnect() {
    this._clearFallbackTimer();
    this._cleanupPeerConnection();
    if (this.signaling) {
      this.signaling.disconnect();
    }
    this.messageHandlers.clear();
    this.lanPeerHandlers.clear();
    this._setState('disconnected');
    this.stateHandlers.clear();
  }
}
