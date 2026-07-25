<script>
    import { togetherStore, leaveRoom } from '../stores/togetherStore.js';
    import { getP2PClient } from './P2PClient.js';

    let { p2pClient = null, onToggleChat = () => {}, onOpenSdpModal = () => {} } = $props();

    function getClient() {
        return p2pClient || getP2PClient();
    }

    let copiedToast = $state(false);
    let toastTimeout = null;

    function handleCopyInvite() {
        if (!$togetherStore.roomCode) return;
        const inviteLink = `anideskplus://together/join?room=${$togetherStore.roomCode}`;
        navigator.clipboard?.writeText(inviteLink).then(() => {
            copiedToast = true;
            if (toastTimeout) clearTimeout(toastTimeout);
            toastTimeout = setTimeout(() => {
                copiedToast = false;
            }, 2000);
        }).catch(() => {
            const el = document.createElement('textarea');
            el.value = inviteLink;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            copiedToast = true;
            if (toastTimeout) clearTimeout(toastTimeout);
            toastTimeout = setTimeout(() => {
                copiedToast = false;
            }, 2000);
        });
    }

    function handleLeave() {
        const client = getClient();
        if (client) {
            client.disconnect();
        }
        leaveRoom();
    }
</script>

{#if $togetherStore.roomCode}
    <div class="together-overlay flex-row">
        <!-- Room Badge -->
        <div class="room-badge flex-row">
            <span class="role-tag" class:host={$togetherStore.isHost} class:guest={!$togetherStore.isHost}>
                {$togetherStore.isHost ? 'Хост' : 'Гость'}
            </span>
            <span class="room-code">{$togetherStore.roomCode}</span>
        </div>

        <!-- Connection Status & Latency -->
        <div class="conn-status flex-row">
            <span class="status-dot {$togetherStore.connectionState}"></span>
            <span class="status-text">
                {#if $togetherStore.connectionState === 'connected-p2p'}
                    P2P
                {:else if $togetherStore.connectionState === 'connected-relay'}
                    Relay
                {:else if $togetherStore.connectionState === 'connecting'}
                    Подключение...
                {:else}
                    Отключено
                {/if}
            </span>
            <span class="rtt font-mono">{$togetherStore.rtt || 0} ms</span>
        </div>

        <!-- Participants -->
        <div class="participants flex-row">
            {#each $togetherStore.participants as participant (participant.id)}
                <div class="participant-avatar" title="{participant.name} ({participant.role})">
                    {#if participant.avatar}
                        <img src={participant.avatar} alt={participant.name} />
                    {:else}
                        <div class="avatar-fallback">{participant.name ? participant.name[0].toUpperCase() : '?'}</div>
                    {/if}
                </div>
            {/each}
        </div>

        <!-- Buffering Notification Badge -->
        {#if $togetherStore.isBufferingAnyGuest}
            <div class="buffering-badge flex-row">
                <span class="spinner font-mono">⏳</span>
                <span>{$togetherStore.bufferingGuestName || 'Гость'} буферизируется...</span>
            </div>
        {/if}

        <!-- Action Buttons -->
        <div class="actions flex-row">
            <button class="action-btn" onclick={handleCopyInvite} title="Скопировать ссылку приглашения">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span>{copiedToast ? 'Скопировано!' : 'Пригласить'}</span>
            </button>

            <button class="action-btn" onclick={onToggleChat} title="Открыть / Закрыть чат">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>Чат</span>
            </button>

            <button class="action-btn" onclick={onOpenSdpModal} title="SDP Токен (Offline)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h10M7 9h10"/></svg>
                <span>SDP</span>
            </button>

            <button class="action-btn leave-btn" onclick={handleLeave} title="Выйти из комнаты">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                <span>Выйти</span>
            </button>
        </div>
    </div>
{/if}

<style>
    .together-overlay {
        position: absolute;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 120;
        align-items: center;
        gap: 14px;
        padding: 8px 18px;
        background: rgba(18, 18, 24, 0.78);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 14px;
        color: #ffffff;
        font-size: 13px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        pointer-events: auto;
    }

    .room-badge {
        align-items: center;
        gap: 8px;
        background: rgba(255, 255, 255, 0.08);
        padding: 4px 10px;
        border-radius: 8px;
    }

    .role-tag {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .role-tag.host {
        background: rgba(235, 87, 87, 0.25);
        color: #ff6b6b;
    }

    .role-tag.guest {
        background: rgba(47, 128, 237, 0.25);
        color: #56ccf2;
    }

    .room-code {
        font-family: monospace;
        font-weight: 600;
        letter-spacing: 0.5px;
    }

    .conn-status {
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.85);
    }

    .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #828282;
    }

    .status-dot.connected-p2p {
        background-color: #27ae60;
        box-shadow: 0 0 6px #27ae60;
    }

    .status-dot.connected-relay {
        background-color: #f2994a;
        box-shadow: 0 0 6px #f2994a;
    }

    .status-dot.connecting {
        background-color: #2f80ed;
        animation: pulse 1.2s infinite;
    }

    .rtt {
        color: rgba(255, 255, 255, 0.6);
        font-size: 11px;
    }

    .participants {
        align-items: center;
        gap: -6px;
    }

    .participant-avatar {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.2);
        overflow: hidden;
        background: #333;
    }

    .participant-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .avatar-fallback {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: bold;
        color: #fff;
        background: #4a4a5a;
    }

    .buffering-badge {
        align-items: center;
        gap: 6px;
        background: rgba(242, 153, 74, 0.2);
        border: 1px solid rgba(242, 153, 74, 0.4);
        color: #f2994a;
        padding: 4px 10px;
        border-radius: 8px;
        font-size: 12px;
        animation: pulse 1.5s infinite;
    }

    .actions {
        align-items: center;
        gap: 8px;
    }

    .action-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #ffffff;
        padding: 5px 10px;
        border-radius: 8px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .action-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: translateY(-1px);
    }

    .leave-btn {
        background: rgba(235, 87, 87, 0.2);
        border-color: rgba(235, 87, 87, 0.3);
        color: #ff6b6b;
    }

    .leave-btn:hover {
        background: rgba(235, 87, 87, 0.4);
    }

    @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
    }
</style>
