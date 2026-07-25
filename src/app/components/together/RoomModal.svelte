<script>
    import { togetherStore, createRoom, joinRoom, leaveRoom } from '../stores/togetherStore.js';
    import { getP2PClient } from './P2PClient.js';

    let { showed = $bindable(false), p2pClient = null } = $props();

    function getClient() {
        return p2pClient || getP2PClient();
    }

    let activeTab = $state('info'); // 'info' | 'join' | 'sdp'
    let inputRoomCode = $state('');
    let generatedSdpToken = $state('');
    let remoteSdpToken = $state('');
    let sdpAnswerToken = $state('');
    let sdpError = $state('');
    let sdpStatus = $state('');
    let copiedNotice = $state('');
    let noticeTimeout = null;

    function showNotice(msg) {
        copiedNotice = msg;
        if (noticeTimeout) clearTimeout(noticeTimeout);
        noticeTimeout = setTimeout(() => {
            copiedNotice = '';
        }, 3000);
    }

    function closeModal() {
        showed = false;
    }

    function handleCreateNewRoom() {
        const code = 'TOG-' + Math.random().toString(36).substring(2, 7).toUpperCase();
        createRoom(code);
        const client = getClient();
        if (client) {
            client.connect(code, true);
        }
        const inviteLink = `anideskplus://together/join?room=${code}`;
        copyToClipboard(inviteLink, 'Комната создана! Ссылка приглашения скопирована.');
    }

    function handleJoinByCode() {
        const code = inputRoomCode.trim().toUpperCase();
        if (!code) return;
        joinRoom(code);
        const client = getClient();
        if (client) {
            client.connect(code, false);
        }
        showNotice(`Подключение к комнате ${code}...`);
        closeModal();
    }

    function handleLeaveRoom() {
        const client = getClient();
        if (client) {
            client.disconnect();
        }
        leaveRoom();
        showNotice('Вы вышли из комнаты');
    }

    function copyToClipboard(text, label = 'Скопировано!') {
        if (!text) return;
        navigator.clipboard?.writeText(text).then(() => {
            showNotice(label);
        }).catch(() => {
            const el = document.createElement('textarea');
            el.value = text;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            showNotice(label);
        });
    }

    async function handleGenerateSdpToken() {
        sdpError = '';
        sdpStatus = 'Генерация локального SDP предложения...';
        try {
            const client = getClient();
            if (client) {
                generatedSdpToken = await client.generateSdpToken();
                sdpStatus = 'SDP токен успешно создан. Скопируйте и передайте его партнеру.';
            } else {
                sdpError = 'P2PClient не инициализирован';
            }
        } catch (err) {
            sdpError = 'Ошибка генерации SDP: ' + (err.message || err);
            sdpStatus = '';
        }
    }

    async function handleAcceptSdpToken() {
        sdpError = '';
        sdpStatus = 'Обработка полученного SDP токена...';
        if (!remoteSdpToken.trim()) {
            sdpError = 'Введите SDP токен партнера';
            return;
        }
        try {
            const client = getClient();
            if (client) {
                const answer = await client.acceptSdpToken(remoteSdpToken.trim());
                if (answer) {
                    sdpAnswerToken = answer;
                    sdpStatus = 'SDP Ответ создан! Скопируйте его и отправьте хосту.';
                } else {
                    sdpStatus = 'SDP Ответ успешно принят. Установка P2P соединения...';
                }
            } else {
                sdpError = 'P2PClient не инициализирован';
            }
        } catch (err) {
            sdpError = 'Ошибка принятия SDP токена: ' + (err.message || err);
            sdpStatus = '';
        }
    }
</script>

{#if showed}
    <div class="modal-background" onclick={closeModal}>
        <div class="together-modal flex-column" onclick={(e) => e.stopPropagation()}>
            <!-- Modal Header -->
            <div class="modal-header flex-row">
                <div class="title flex-row">
                    <span>Смотреть Вместе (AniTogether)</span>
                </div>
                <button class="close-btn" onclick={closeModal}>✕</button>
            </div>

            <!-- Tabs Header -->
            <div class="tabs-header flex-row">
                <button class="tab-btn" class:active={activeTab === 'info'} onclick={() => activeTab = 'info'}>
                    Информация / Ссылка
                </button>
                <button class="tab-btn" class:active={activeTab === 'join'} onclick={() => activeTab = 'join'}>
                    Войти по коду
                </button>
                <button class="tab-btn" class:active={activeTab === 'sdp'} onclick={() => activeTab = 'sdp'}>
                    Offline SDP Токен
                </button>
            </div>

            <!-- Modal Content -->
            <div class="modal-body flex-column">
                {#if copiedNotice}
                    <div class="notice-bar flex-row">{copiedNotice}</div>
                {/if}

                {#if activeTab === 'info'}
                    <div class="tab-content flex-column">
                        {#if $togetherStore.roomCode}
                            <div class="info-card flex-column">
                                <div class="card-row flex-row">
                                    <span class="label">Код комнаты:</span>
                                    <span class="value room-code">{$togetherStore.roomCode}</span>
                                </div>
                                <div class="card-row flex-row">
                                    <span class="label">Ваш статус:</span>
                                    <span class="value role">{$togetherStore.isHost ? 'Хост (Ведущий)' : 'Гость'}</span>
                                </div>
                                <div class="card-row flex-row">
                                    <span class="label">Соединение:</span>
                                    <span class="value status {$togetherStore.connectionState}">
                                        {$togetherStore.connectionState} ({$togetherStore.rtt || 0} ms)
                                    </span>
                                </div>
                                <div class="card-row flex-row">
                                    <span class="label">Ссылка приглашения:</span>
                                    <span class="value link">anideskplus://together/join?room={$togetherStore.roomCode}</span>
                                </div>
                            </div>

                            <div class="btn-group flex-row">
                                <button class="btn primary" onclick={() => copyToClipboard(`anideskplus://together/join?room=${$togetherStore.roomCode}`, 'Ссылка приглашения скопирована!')}>
                                    Скопировать ссылку
                                </button>
                                <button class="btn secondary" onclick={() => copyToClipboard($togetherStore.roomCode, 'Код комнаты скопирован!')}>
                                    Скопировать код
                                </button>
                                <button class="btn danger" onclick={handleLeaveRoom}>
                                    Покинуть комнату
                                </button>
                            </div>
                        {:else}
                            <div class="empty-state flex-column">
                                <h3>Вы еще не в комнате</h3>
                                <p>Создайте новую комнату для совместного просмотра с друзьями или воспользуйтесь присоединением по коду.</p>
                                <button class="btn primary main-action-btn" onclick={handleCreateNewRoom}>
                                    Создать новую комнату
                                </button>
                            </div>
                        {/if}
                    </div>
                {:else if activeTab === 'join'}
                    <div class="tab-content flex-column">
                        <h3>Присоединиться к совместному просмотру</h3>
                        <p class="sub-desc">Введите код комнаты, который вам отправил хост.</p>

                        <div class="input-group flex-row">
                            <input
                                type="text"
                                class="modal-input font-mono"
                                placeholder="TOG-XXXXX"
                                bind:value={inputRoomCode}
                            />
                            <button class="btn primary" onclick={handleJoinByCode} disabled={!inputRoomCode.trim()}>
                                Войти
                            </button>
                        </div>
                    </div>
                {:else if activeTab === 'sdp'}
                    <div class="tab-content flex-column sdp-content">
                        <h3>Ручной обмен SDP токенами (Offline Mode)</h3>
                        <p class="sub-desc">Используется при отсутствии подключения к сети MQTT или для прямого WebRTC соединения.</p>

                        {#if sdpError}
                            <div class="error-msg">{sdpError}</div>
                        {/if}
                        {#if sdpStatus}
                            <div class="status-msg">{sdpStatus}</div>
                        {/if}

                        <div class="sdp-section flex-column">
                            <div class="section-title flex-row">
                                <span>1. Сгенерировать локальный SDP токен</span>
                                <button class="btn small" onclick={handleGenerateSdpToken}>Создать токен</button>
                            </div>
                            {#if generatedSdpToken}
                                <textarea class="sdp-textarea" readonly value={generatedSdpToken}></textarea>
                                <button class="btn secondary small-btn" onclick={() => copyToClipboard(generatedSdpToken, 'SDP токен скопирован!')}>
                                    Скопировать токен
                                </button>
                            {/if}
                        </div>

                        <div class="sdp-section flex-column">
                            <div class="section-title">2. Вставить SDP токен партнера</div>
                            <textarea
                                class="sdp-textarea"
                                placeholder="Вставьте Base64 SDP токен, полученный от второго участника..."
                                bind:value={remoteSdpToken}
                            ></textarea>
                            <button class="btn primary small-btn" onclick={handleAcceptSdpToken} disabled={!remoteSdpToken.trim()}>
                                Принять SDP Токен
                            </button>

                            {#if sdpAnswerToken}
                                <div class="answer-box flex-column">
                                    <span class="label">Ваш SDP Ответ (передайте хосту):</span>
                                    <textarea class="sdp-textarea" readonly value={sdpAnswerToken}></textarea>
                                    <button class="btn secondary small-btn" onclick={() => copyToClipboard(sdpAnswerToken, 'SDP Ответ скопирован!')}>
                                        Скопировать SDP Ответ
                                    </button>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-background {
        position: fixed;
        inset: 0;
        z-index: 500;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .together-modal {
        width: 640px;
        max-width: 90vw;
        max-height: 85vh;
        background: var(--alt-background-color, #1a1919);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.7);
        color: var(--main-text-color, #ffffff);
        overflow: hidden;
    }

    .modal-header {
        align-items: center;
        justify-content: space-between;
        padding: 18px 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: var(--select-button-left-color, rgba(255, 255, 255, 0.03));
    }

    .title {
        align-items: center;
        gap: 10px;
        font-size: 18px;
        font-weight: 700;
        color: var(--main-text-color);
    }

    .close-btn {
        background: none;
        border: none;
        color: var(--secondary-text-color, rgba(255, 255, 255, 0.5));
        font-size: 18px;
        cursor: pointer;
        padding: 4px;
        transition: color 0.2s ease;
    }

    .close-btn:hover {
        color: var(--main-text-color, #ffffff);
    }

    .tabs-header {
        display: flex;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.25);
    }

    .tab-btn {
        flex: 1;
        background: none;
        border: none;
        padding: 12px 16px;
        color: var(--secondary-text-color, rgba(255, 255, 255, 0.6));
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.2s ease;
    }

    .tab-btn.active {
        color: var(--main-text-color, #ffffff);
        border-bottom-color: var(--watching-color, #52b628);
        background: rgba(255, 255, 255, 0.05);
    }

    .modal-body {
        padding: 24px;
        overflow-y: auto;
        gap: 16px;
    }

    .notice-bar {
        background: var(--watching-shadow-color, rgba(82, 182, 40, 0.2));
        border: 1px solid var(--watching-color, #52b628);
        color: var(--watching-color, #52b628);
        padding: 10px 16px;
        border-radius: 10px;
        font-size: 13px;
        justify-content: center;
        font-weight: 600;
    }

    .tab-content {
        gap: 16px;
    }

    .sub-desc {
        font-size: 13px;
        color: var(--secondary-text-color, rgba(255, 255, 255, 0.6));
        line-height: 1.5;
        margin: 0;
    }

    .info-card {
        background: var(--select-button-color, #202020);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        padding: 18px;
        gap: 14px;
    }

    .card-row {
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
    }

    .card-row .label {
        color: var(--secondary-text-color, rgba(255, 255, 255, 0.6));
    }

    .card-row .value {
        font-weight: 600;
        color: var(--main-text-color);
    }

    .card-row .room-code {
        font-family: monospace;
        font-size: 15px;
        color: var(--watching-color, #52b628);
    }

    .card-row .link {
        font-family: monospace;
        font-size: 11px;
        color: var(--secondary-text-color, rgba(255, 255, 255, 0.7));
        max-width: 320px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .btn-group {
        gap: 10px;
        justify-content: flex-end;
    }

    .btn {
        padding: 10px 18px;
        border-radius: 12px;
        border: none;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .btn.primary {
        background: var(--watching-color, #52b628);
        color: #ffffff;
    }

    .btn.primary:hover:not(:disabled) {
        background: #469f22;
        transform: translateY(-1px);
    }

    .btn.secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
    }

    .btn.secondary:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .btn.danger {
        background: rgba(235, 87, 87, 0.2);
        color: #ff6b6b;
        border: 1px solid rgba(235, 87, 87, 0.3);
    }

    .btn.danger:hover {
        background: rgba(235, 87, 87, 0.4);
    }

    .btn.small {
        padding: 4px 10px;
        font-size: 11px;
    }

    .btn.small-btn {
        padding: 6px 12px;
        font-size: 12px;
        align-self: flex-start;
        margin-top: 6px;
    }

    .btn:disabled {
        opacity: 0.5;
        cursor: default;
    }

    .empty-state {
        align-items: center;
        text-align: center;
        padding: 24px 0;
        gap: 12px;
    }

    .empty-state h3 {
        margin: 0;
        font-size: 18px;
    }

    .empty-state p {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.6);
        max-width: 400px;
        margin: 0;
    }

    .main-action-btn {
        margin-top: 12px;
        padding: 12px 24px;
        font-size: 14px;
    }

    .input-group {
        gap: 10px;
        margin-top: 12px;
    }

    .modal-input {
        flex: 1;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 10px;
        padding: 10px 14px;
        color: #ffffff;
        font-size: 14px;
        outline: none;
    }

    .modal-input:focus {
        border-color: #2f80ed;
    }

    .sdp-content {
        gap: 14px;
    }

    .sdp-section {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 14px;
        gap: 8px;
    }

    .section-title {
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
    }

    .sdp-textarea {
        width: 100%;
        height: 70px;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 8px 10px;
        color: #56ccf2;
        font-family: monospace;
        font-size: 11px;
        resize: none;
        outline: none;
        box-sizing: border-box;
    }

    .answer-box {
        margin-top: 10px;
        gap: 6px;
    }

    .answer-box .label {
        font-size: 12px;
        color: #27ae60;
        font-weight: 600;
    }

    .error-msg {
        background: rgba(235, 87, 87, 0.2);
        border: 1px solid rgba(235, 87, 87, 0.4);
        color: #ff6b6b;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
    }

    .status-msg {
        background: rgba(47, 128, 237, 0.2);
        border: 1px solid rgba(47, 128, 237, 0.4);
        color: #56ccf2;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
    }
</style>
