import { writable } from 'svelte/store';

const initialStoreState = {
    roomCode: null,
    isHost: false,
    hostId: null,
    peerId: null,
    connectionState: 'disconnected',
    participants: [],
    chatMessages: [],
    reactions: [],
    isBufferingAnyGuest: false,
    bufferingGuestName: null,
    currentEpisodeId: null,
    rtt: 0
};

const { subscribe, set, update } = writable(initialStoreState);

export const togetherStore = {
    subscribe,
    set,
    update,
    createRoom(code, user = {}) {
        const peerId = user.id || user.peerId || 'host_' + Math.random().toString(36).substring(2, 9);
        update((s) => ({
            ...s,
            roomCode: code,
            isHost: true,
            hostId: peerId,
            peerId: peerId,
            connectionState: 'connecting',
            participants: [{
                id: peerId,
                name: user.name || 'Host',
                avatar: user.avatar || '',
                role: 'host',
                isBuffering: false,
                rtt: 0
            }]
        }));
    },
    joinRoom(code, user = {}) {
        const peerId = user.id || user.peerId || 'guest_' + Math.random().toString(36).substring(2, 9);
        update((s) => ({
            ...s,
            roomCode: code,
            isHost: false,
            hostId: null,
            peerId: peerId,
            connectionState: 'connecting',
            participants: [{
                id: peerId,
                name: user.name || 'Guest',
                avatar: user.avatar || '',
                role: 'guest',
                isBuffering: false,
                rtt: 0
            }]
        }));
    },
    leaveRoom() {
        set({ ...initialStoreState });
    },
    setConnectionState(state) {
        update((s) => ({ ...s, connectionState: state }));
    },
    updateParticipants(list) {
        update((s) => ({ ...s, participants: Array.isArray(list) ? list : [] }));
    },
    addChatMessage(msg) {
        update((s) => {
            const chatMessages = [...s.chatMessages, {
                id: msg.id || Math.random().toString(36).substring(2, 9),
                senderId: msg.senderId || msg.sender || 'unknown',
                senderName: msg.senderName || msg.sender || 'User',
                text: msg.text || msg.content || '',
                timestamp: msg.timestamp || Date.now(),
                system: !!msg.system
            }];
            return { ...s, chatMessages };
        });
    },
    addReaction(reaction) {
        update((s) => {
            const reactionItem = {
                id: reaction.id || Math.random().toString(36).substring(2, 9),
                emoji: reaction.emoji || reaction.reaction || '❤️',
                senderName: reaction.senderName || reaction.sender || 'User',
                timestamp: reaction.timestamp || Date.now()
            };
            const reactions = [...s.reactions, reactionItem];
            return { ...s, reactions };
        });
    },
    setBufferingState(isBuffering, name = null) {
        update((s) => ({
            ...s,
            isBufferingAnyGuest: !!isBuffering,
            bufferingGuestName: isBuffering ? (name || s.bufferingGuestName || 'Guest') : null
        }));
    },
    setCurrentEpisodeId(episodeId) {
        update((s) => ({ ...s, currentEpisodeId: episodeId }));
    },
    setRtt(rtt) {
        update((s) => ({ ...s, rtt }));
    }
};

export const createRoom = togetherStore.createRoom;
export const joinRoom = togetherStore.joinRoom;
export const leaveRoom = togetherStore.leaveRoom;
export const setConnectionState = togetherStore.setConnectionState;
export const updateParticipants = togetherStore.updateParticipants;
export const addChatMessage = togetherStore.addChatMessage;
export const addReaction = togetherStore.addReaction;
export const setBufferingState = togetherStore.setBufferingState;
export const setCurrentEpisodeId = togetherStore.setCurrentEpisodeId;
export const setRtt = togetherStore.setRtt;

export default togetherStore;
