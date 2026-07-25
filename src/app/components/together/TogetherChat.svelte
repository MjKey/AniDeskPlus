<script>
    import { togetherStore, addChatMessage, addReaction } from '../stores/togetherStore.js';
    import { tick } from 'svelte';

    let { p2pClient = null, isOpen = $bindable(true), onClose = () => { isOpen = false; } } = $props();

    let inputText = $state('');
    let messageListEl = $state(null);

    const quickEmojis = ['❤️', '😂', '😮', '😢', '🔥', '👍', '👏', '🎉'];

    async function scrollToBottom() {
        await tick();
        if (messageListEl) {
            messageListEl.scrollTop = messageListEl.scrollHeight;
        }
    }

    $effect(() => {
        if ($togetherStore.chatMessages.length) {
            scrollToBottom();
        }
    });

    function handleSendMessage() {
        const text = inputText.trim();
        if (!text) return;

        const storeState = $togetherStore;
        const me = storeState.participants.find(p => p.id === storeState.peerId);
        const senderName = me ? me.name : (storeState.isHost ? 'Хост' : 'Гость');
        const senderAvatar = me ? me.avatar : '';

        const messageObj = {
            id: Math.random().toString(36).substring(2, 9),
            senderId: storeState.peerId || 'user',
            senderName: senderName,
            senderAvatar: senderAvatar,
            text: text,
            timestamp: Date.now()
        };

        if (p2pClient) {
            p2pClient.send({
                type: 'CHAT_MESSAGE',
                payload: messageObj
            });
        }

        addChatMessage(messageObj);
        inputText = '';
        scrollToBottom();
    }

    function handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    }

    function handleSendReaction(emoji) {
        const storeState = $togetherStore;
        const me = storeState.participants.find(p => p.id === storeState.peerId);
        const senderName = me ? me.name : (storeState.isHost ? 'Хост' : 'Гость');

        const reactionObj = {
            id: Math.random().toString(36).substring(2, 9),
            emoji: emoji,
            senderId: storeState.peerId || 'user',
            senderName: senderName,
            timestamp: Date.now()
        };

        if (p2pClient) {
            p2pClient.send({
                type: 'EMOTE_REACTION',
                payload: reactionObj
            });
        }

        addReaction(reactionObj);
    }

    function formatTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${mins}`;
    }
</script>

{#if isOpen && $togetherStore.roomCode}
    <div class="together-chat flex-column">
        <!-- Header -->
        <div class="chat-header flex-row">
            <div class="header-title flex-row">
                <span class="chat-icon">💬</span>
                <span>Чат комнаты</span>
                <span class="msg-count">({$togetherStore.chatMessages.length})</span>
            </div>
            <button class="close-btn" onclick={onClose} title="Свернуть">✕</button>
        </div>

        <!-- Quick Reactions Bar -->
        <div class="quick-reactions flex-row">
            {#each quickEmojis as emoji}
                <button class="reaction-emoji-btn" onclick={() => handleSendReaction(emoji)}>
                    {emoji}
                </button>
            {/each}
        </div>

        <!-- Messages List -->
        <div class="messages-list flex-column" bind:this={messageListEl}>
            {#if $togetherStore.chatMessages.length === 0}
                <div class="empty-chat flex-column">
                    <span>Сообщений пока нет</span>
                    <span class="sub">Напишите что-нибудь или отправьте эмодзи!</span>
                </div>
            {:else}
                {#each $togetherStore.chatMessages as msg (msg.id)}
                    {#if msg.system}
                        <div class="system-message flex-row">
                            <span>{msg.text}</span>
                        </div>
                    {:else}
                        <div class="chat-message flex-row" class:is-me={msg.senderId === $togetherStore.peerId}>
                            <div class="msg-avatar">
                                {#if msg.senderAvatar}
                                    <img src={msg.senderAvatar} alt={msg.senderName} />
                                {:else}
                                    <div class="avatar-fallback">{msg.senderName ? msg.senderName[0].toUpperCase() : '?'}</div>
                                {/if}
                            </div>
                            <div class="msg-body flex-column">
                                <div class="msg-meta flex-row">
                                    <span class="sender-name">{msg.senderName}</span>
                                    <span class="msg-time">{formatTime(msg.timestamp)}</span>
                                </div>
                                <div class="msg-text">{msg.text}</div>
                            </div>
                        </div>
                    {/if}
                {/each}
            {/if}
        </div>

        <!-- Chat Input -->
        <div class="chat-input-row flex-row">
            <input
                type="text"
                class="chat-input"
                placeholder="Написать сообщение..."
                bind:value={inputText}
                onkeydown={handleKeydown}
            />
            <button class="send-btn" onclick={handleSendMessage} disabled={!inputText.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
            </button>
        </div>
    </div>
{/if}

<style>
    .together-chat {
        position: absolute;
        right: 20px;
        bottom: 80px;
        width: 330px;
        height: 440px;
        z-index: 110;
        background: rgba(18, 18, 24, 0.88);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
        pointer-events: auto;
        color: #ffffff;
    }

    .chat-header {
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.05);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .header-title {
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
    }

    .msg-count {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
    }

    .close-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-size: 14px;
        cursor: pointer;
        padding: 4px;

        &:hover {
            color: #fff;
        }
    }

    .quick-reactions {
        align-items: center;
        justify-content: space-around;
        padding: 8px;
        background: rgba(0, 0, 0, 0.2);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .reaction-emoji-btn {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        transition: transform 0.15s ease;
        padding: 2px;

        &:hover {
            transform: scale(1.3);
        }
    }

    .messages-list {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        gap: 10px;
    }

    .empty-chat {
        height: 100%;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.5);
        font-size: 13px;
        text-align: center;
        gap: 6px;
    }

    .empty-chat .sub {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.35);
    }

    .system-message {
        justify-content: center;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        background: rgba(255, 255, 255, 0.05);
        padding: 4px 10px;
        border-radius: 10px;
        margin: 4px 0;
    }

    .chat-message {
        gap: 10px;
        align-items: flex-start;
    }

    .chat-message.is-me {
        flex-direction: row-reverse;
    }

    .chat-message.is-me .msg-body {
        align-items: flex-end;
    }

    .chat-message.is-me .msg-text {
        background: rgba(47, 128, 237, 0.3);
        border-color: rgba(47, 128, 237, 0.4);
    }

    .msg-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        overflow: hidden;
        background: #333;
        flex-shrink: 0;
    }

    .msg-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .msg-body {
        gap: 2px;
        max-width: 75%;
    }

    .msg-meta {
        align-items: center;
        gap: 6px;
        font-size: 11px;
    }

    .sender-name {
        font-weight: 600;
        color: rgba(255, 255, 255, 0.85);
    }

    .msg-time {
        color: rgba(255, 255, 255, 0.4);
        font-size: 10px;
    }

    .msg-text {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 6px 10px;
        border-radius: 10px;
        font-size: 13px;
        line-height: 1.4;
        word-break: break-word;
    }

    .chat-input-row {
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: rgba(0, 0, 0, 0.3);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .chat-input {
        flex: 1;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 8px 12px;
        color: #fff;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s ease;
    }

    .chat-input:focus {
        border-color: rgba(255, 255, 255, 0.4);
    }

    .send-btn {
        background: #2f80ed;
        border: none;
        color: #fff;
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s ease;
    }

    .send-btn:hover:not(:disabled) {
        background: #276ace;
    }

    .send-btn:disabled {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.3);
        cursor: default;
    }
</style>
