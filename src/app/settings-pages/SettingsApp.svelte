<script>
    import Separator from "../components/elements/Separator.svelte";
    import CheckboxElement from "../components/settings/CheckboxElement.svelte";
    import TitleElement from "../components/settings/TitleElement.svelte";
    import DropdownElement from "../components/settings/DropdownElement.svelte";
    import TextboxElement from "../components/settings/TextboxElement.svelte";
    import { localStorageWritable } from "@babichjacob/svelte-localstorage";
    import InfoElement from "../components/settings/InfoElement.svelte";
    import { onMount } from "svelte";
    import {
        getShikimoriWhoAmI,
        getShikimoriAuthUrl,
        exchangeShikimoriCode
    } from "../utils/shikimori";

    let guiSettings, endpointUrl;
    let isDebug = false;
    let shikiToken = "";
    let shikiUser = null;
    let shikiCheckStatus = null;
    let isCheckingShiki = false;
    let shikiAuthCodeInput = "";

    let restartRequired = baseSettings?.restartRequired || false;

    const guiSettingsRaw = localStorageWritable(
        "guiSettings",
        utils.guiDefaultSettings,
    );

    const endpointUrlRaw = localStorageWritable("endpointUrl", "api-s.anixsekai.com");   

    guiSettingsRaw.subscribe((value) => {
        guiSettings = value;
    });
    
    endpointUrlRaw.subscribe((value) => {
        endpointUrl = value;
    });

    onMount(async () => {
        if (window.prc?.isDebug) {
            isDebug = await window.prc.isDebug();
        }

        shikiToken = localStorage.getItem("shikimori_token") || "";
        const u = localStorage.getItem("shikimori_user");
        if (u) {
            try { shikiUser = JSON.parse(u); } catch (e) {}
        }
    });

    async function checkAndSaveShikimoriToken(tokenValue) {
        shikiToken = tokenValue.trim();
        localStorage.setItem("shikimori_token", shikiToken);

        if (!shikiToken) {
            localStorage.removeItem("shikimori_user");
            shikiUser = null;
            shikiCheckStatus = { type: "info", text: "Токен Shikimori удален." };
            return;
        }

        isCheckingShiki = true;
        shikiCheckStatus = { type: "info", text: "Проверка токена Shikimori..." };

        const user = await getShikimoriWhoAmI(shikiToken);
        isCheckingShiki = false;

        if (user && user.id) {
            shikiUser = user;
            localStorage.setItem("shikimori_user", JSON.stringify(user));
            shikiCheckStatus = { type: "success", text: `Успешно подключен аккаунт Shikimori: ${user.nickname} (ID: ${user.id})` };
        } else {
            shikiUser = null;
            localStorage.removeItem("shikimori_user");
            shikiCheckStatus = { type: "error", text: "Не удалось проверить токен Shikimori. Проверьте правильность токена." };
        }
    }

    async function handleExchangeShikiCode() {
        if (!shikiAuthCodeInput.trim()) return;
        isCheckingShiki = true;
        shikiCheckStatus = { type: "info", text: "Обмен кода авторизации на токен доступа..." };

        const tokenData = await exchangeShikimoriCode(shikiAuthCodeInput);
        if (tokenData && tokenData.access_token) {
            if (tokenData.refresh_token) {
                localStorage.setItem("shikimori_refresh_token", tokenData.refresh_token);
            }
            await checkAndSaveShikimoriToken(tokenData.access_token);
            shikiAuthCodeInput = "";
        } else {
            isCheckingShiki = false;
            shikiCheckStatus = { type: "error", text: "Не удалось обменять код авторизации. Проверьте код и повторите попытку." };
        }
    }

    function handleShikiLogout() {
        shikiToken = "";
        shikiUser = null;
        shikiCheckStatus = { type: "info", text: "Вы успешно вышли из аккаунта Shikimori." };
        localStorage.removeItem("shikimori_token");
        localStorage.removeItem("shikimori_user");
        localStorage.removeItem("shikimori_refresh_token");
    }

    function updateGuiKey(key, value) {
        guiSettings[key] = value;
        guiSettingsRaw.set(guiSettings);
    }

    function updateMainKey(key, value) {
        restartRequired = true;
        baseSettings.restartRequired = true;
        baseSettings[key] = value;
        settings.set(key, value);
    }
</script>

<div class="flex-column app-settings">
    {#if restartRequired}
        <InfoElement
            title="Требуется перезагрузка"
            description="Изменения вступят в силу после перезагрузки."
            type="warning"
        />
    {/if}

    {#if isDebug}
        <InfoElement
            title="Debug Mode Активен"
            description="Приложение запущенно с флагом --debug (DevTools и расширенный лог)"
            type="info"
        />
    {/if}

    <TitleElement title="Основное" />

    <CheckboxElement
        title="Сворачивать в трей при закрытии"
        description="При нажатии на крестик окно будет сворачиваться в системный трей Windows."
        value={baseSettings?.MinimizeToTray ?? true}
        onChangeCallback={(e) => updateMainKey("MinimizeToTray", e)}
    />

    <CheckboxElement
        title="Уведомления о новых сериях"
        description="Присылать системные уведомления Windows о выходе новых серий для аниме в Избранном."
        value={baseSettings?.EnableEpisodeNotifications ?? true}
        onChangeCallback={(e) => updateMainKey("EnableEpisodeNotifications", e)}
    />

    <TextboxElement
        title="Предпочитаемая озвучка (фильтр для уведомлений)"
        placeholder="Например: AniLibria, Studio Band, Flarrow Films (или пусто для всех)"
        value={baseSettings?.PreferredDubber ?? ""}
        onChangeCallback={(e) => updateMainKey("PreferredDubber", e.target.value)}
    />

    <CheckboxElement
        title="Включить автообновление"
        description="Приложение будет автоматически проверять и устанавливать обновления при их наличии."
        value={baseSettings?.AutoUpdate ?? true}
        onChangeCallback={(e) => updateMainKey("AutoUpdate", e)}
    />

    <CheckboxElement
        title="Включить Discord RPC"
        description="Отображает текущий статус просмотра в вашем профиле Discord."
        value={baseSettings?.EnableRPC ?? false}
        onChangeCallback={(e) => updateMainKey("EnableRPC", e)}
    />

    <CheckboxElement
        title="Включить DevTools"
        description="Позволяет использовать DevTools в приложении."
        value={baseSettings?.EnableDevTools ?? false}
        onChangeCallback={(e) => updateMainKey("EnableDevTools", e)}
    />

    <DropdownElement
        title="Эндпоинт API"
        values={utils.endpointValues}
        value={endpointUrl}
        placeholder="Выберите эндпоинт"
        onChangeCallback={(e, v) => {
            endpointUrlRaw.set(v);
            restartRequired = true;
            baseSettings.restartRequired = true;
        }}
    />

    <Separator width="75%" />

    <TitleElement title="Интеграция с Shikimori 🌸" />

    {#if shikiUser}
        <InfoElement
            title={`Shikimori подключен: ${shikiUser.nickname}`}
            description={`ID: ${shikiUser.id}. Прогресс просмотра и статусы синхронизируются.`}
            type="info"
        />
        <div class="shiki-action-row flex-row">
            <button class="shiki-logout-btn" onclick={handleShikiLogout}>Выйти из аккаунта Shikimori</button>
        </div>
    {:else}
        <div class="shiki-auth-block flex-column">
            <div class="shiki-auth-desc">
                Для автоматической синхронизации просмотров авторизуйтесь через браузер или введите код авторизации.
            </div>
            <button class="shiki-oauth-btn" onclick={() => winApi.openLink(getShikimoriAuthUrl())}>
                🔗 1. Авторизоваться в Shikimori через браузер ↗
            </button>

            <div class="shiki-code-section flex-column">
                <span class="code-label">2. Скопируйте и вставьте полученный код авторизации:</span>
                <div class="code-input-row flex-row">
                    <input
                        type="text"
                        class="shiki-code-input"
                        placeholder="Код авторизации (Authorization Code)"
                        bind:value={shikiAuthCodeInput}
                    />
                    <button
                        class="shiki-submit-code-btn"
                        disabled={isCheckingShiki || !shikiAuthCodeInput.trim()}
                        onclick={handleExchangeShikiCode}
                    >
                        Подтвердить
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if shikiCheckStatus}
        <InfoElement
            title="Статус подключения Shikimori"
            description={shikiCheckStatus.text}
            type={shikiCheckStatus.type === 'error' ? 'warning' : 'info'}
        />
    {/if}

    <TextboxElement
        title="Прямой Токен доступа (Access Token)"
        placeholder="Или вставьте готовый токен напрямую"
        value={shikiToken}
        onChangeCallback={(e) => checkAndSaveShikimoriToken(e.target.value)}
    />

    <CheckboxElement
        title="Авто-синхронизация при просмотре"
        description="Автоматически обновлять количество просмотренных серий в Shikimori при просмотре."
        value={baseSettings?.SyncShikimoriOnWatch ?? true}
        onChangeCallback={(e) => updateMainKey("SyncShikimoriOnWatch", e)}
    />

    <Separator width="75%" />

    <TitleElement title="Внешний вид" />

    <DropdownElement
        title="Тема"
        values={utils.themeValues}
        value={guiSettings.theme}
        placeholder="Выберите тему"
        onChangeCallback={(e, v) => {
            updateGuiKey("theme", v);
            document.body.classList = [`${v}-theme`];
        }}
    />
</div>

<style>
    .app-settings {
        align-items: center;
        margin-top: 40px;
    }

    .shiki-auth-block {
        width: 75%;
        background-color: var(--alt-background-color);
        padding: 16px;
        border-radius: 12px;
        margin: 10px 0;
        gap: 12px;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .shiki-auth-desc {
        font-size: 13px;
        color: var(--secondary-text-color);
    }

    .shiki-oauth-btn {
        background-color: var(--select-button-left-color);
        color: var(--main-text-color);
        border: none;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        transition: opacity 0.2s;
        align-self: flex-start;
    }

    .shiki-oauth-btn:hover {
        opacity: 0.85;
    }

    .shiki-code-section {
        gap: 6px;
        margin-top: 6px;
    }

    .code-label {
        font-size: 12px;
        color: var(--main-text-color);
    }

    .code-input-row {
        gap: 10px;
        width: 100%;
    }

    .shiki-code-input {
        flex: 1;
        background-color: var(--alt-gray-background-color);
        color: var(--main-text-color);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 13px;
    }

    .shiki-submit-code-btn {
        background-color: var(--select-button-color);
        color: var(--main-text-color);
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: bold;
        cursor: pointer;
    }

    .shiki-submit-code-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .shiki-action-row {
        width: 75%;
        margin-bottom: 10px;
    }

    .shiki-logout-btn {
        background-color: rgba(231, 76, 60, 0.2);
        color: #e74c3c;
        border: 1px solid rgba(231, 76, 60, 0.4);
        padding: 8px 14px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        font-size: 12px;
    }

    .shiki-logout-btn:hover {
        background-color: rgba(231, 76, 60, 0.35);
    }
</style>
