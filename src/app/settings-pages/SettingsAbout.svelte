<script>
    import githubLogo from "../icons/github.svg";
    import Icon from "../components/elements/Icon.svelte";
    import { onMount } from "svelte";

    let versionInfo = null;
    let updateStatus = null;
    let isChecking = false;
    let showOriginalDevs = false;

    onMount(async () => {
        if (window.prc?.getVersions) {
            versionInfo = await window.prc.getVersions();
        }
    });

    async function checkUpdates() {
        if (isChecking) return;
        isChecking = true;
        updateStatus = { status: "checking", text: "Проверка обновлений..." };

        try {
            const res = await window.updater.check();
            if (res.status === "update_available") {
                updateStatus = {
                    status: "available",
                    text: `Доступно обновление v${res.latestVersion}!`,
                    url: res.releaseUrl || "https://github.com/MjKey/AniDeskPlus/releases"
                };
            } else if (res.status === "latest") {
                updateStatus = {
                    status: "latest",
                    text: `У вас установлена последняя версия (v${res.currentVersion || versionInfo?.anidesk || ""})`
                };
            } else {
                updateStatus = {
                    status: "error",
                    text: "Не удалось проверить обновления.",
                    url: "https://github.com/MjKey/AniDeskPlus/releases"
                };
            }
        } catch (e) {
            updateStatus = {
                status: "error",
                text: "Ошибка при проверке обновлений.",
                url: "https://github.com/MjKey/AniDeskPlus/releases"
            };
        } finally {
            isChecking = false;
        }
    }
</script>

<div class="about-program flex-column">
    <div class="about-program-title flex-row">
        <img
            src="./assets/icons/anidesk-transparent.png"
            width="200px"
            alt="icon"
        />
        <div class="app-info flex-column">
            <span class="app-title">AniDeskPlus</span>
            <p class="app-description">
                Улучшенный неофициальный десктоп-клиент для приложения <strong
                    >Anixart</strong
                > с открытым исходным кодом. Разработан с использованием
                <strong>Node.js</strong>, <strong>Electron</strong>,
                <strong>Svelte 5</strong>
                и <strong>AnixartJS</strong>.
            </p>
        </div>
    </div>

    <div class="update-section flex-column">
        <span class="app-title">Версия и обновления</span>
        <div class="update-card flex-row">
            <div class="version-badge flex-column">
                <span class="version-label">Версия приложения</span>
                <span class="version-number">v{versionInfo?.anidesk || ""} {#if versionInfo?.isDebug}<span class="debug-tag">[DEBUG]</span>{/if}</span>
            </div>
            <div class="update-actions flex-column">
                <button class="update-btn flex-row" class:disabled={isChecking} onclick={checkUpdates}>
                    <span>{isChecking ? "Проверка..." : "Проверить обновления"}</span>
                </button>
                {#if updateStatus}
                    <div class="update-status-text flex-column" class:success={updateStatus.status === 'latest'} class:available={updateStatus.status === 'available'}>
                        <span>{updateStatus.text}</span>
                        {#if updateStatus.url}
                            <button class="open-release-btn" onclick={() => winApi.openLink(updateStatus.url)}>
                                Открыть страницу релизов ↗
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <div class="app-developers flex-column">
        <span class="app-title">Разработчик AniDeskPlus</span>
        <div class="developers flex-column">
            <div class="developer flex-row">
                <img
                    src="https://github.com/MjKey.png"
                    width="100px"
                    alt="MjKey avatar"
                    loading="lazy"
                />
                <div class="dev-info">
                    <span class="developer-name">MjKey</span>
                    <span class="developer-role">Создатель форка & Главный разработчик AniDeskPlus</span>
                    <div class="social-links">
                        <button
                            title="GitHub MjKey/AniDeskPlus"
                            onclick={() => {
                                winApi.openLink(`https://github.com/MjKey/AniDeskPlus`);
                            }}
                        >
                            <Icon
                                src={githubLogo}
                                varColor="--main-text-color"
                                size={{ width: 35, height: 35 }}
                            />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Свернутый слой авторов оригинального AniDesk -->
        <div class="original-devs-container flex-column">
            <button class="toggle-original-devs-btn flex-row" onclick={() => showOriginalDevs = !showOriginalDevs}>
                <span>{showOriginalDevs ? "▼ Скрыть разработчиков оригинального AniDesk" : "► Разработчики оригинального AniDesk"}</span>
            </button>

            {#if showOriginalDevs}
                <div class="original-devs-list flex-column">
                    <div class="developer flex-row">
                        <img
                            src="https://github.com/theDesConnet.png"
                            width="80px"
                            alt="DesConnet avatar"
                            loading="lazy"
                        />
                        <div class="dev-info">
                            <span class="developer-name">DesConnet</span>
                            <span class="developer-role">Разработчик оригинального AniDesk</span>
                            <div class="social-links">
                                <button
                                    onclick={() => {
                                        winApi.openLink(`https://github.com/theDesConnet`);
                                    }}
                                >
                                    <Icon
                                        src={githubLogo}
                                        varColor="--main-text-color"
                                        size={{ width: 30, height: 30 }}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="developer flex-row">
                        <img
                            src="https://github.com/hack1exe.png"
                            width="80px"
                            alt="Hack1exe avatar"
                            loading="lazy"
                        />
                        <div class="dev-info">
                            <span class="developer-name">Michail Electronshik (aka Hack1exe)</span>
                            <span class="developer-role">Соразработчик оригинального AniDesk</span>
                            <div class="social-links">
                                <button
                                    onclick={() => {
                                        winApi.openLink(`https://github.com/hack1exe`);
                                    }}
                                >
                                    <Icon
                                        src={githubLogo}
                                        varColor="--main-text-color"
                                        size={{ width: 30, height: 30 }}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .about-program {
        width: 100%;
        height: 100%;
        align-items: center;
        padding-bottom: 40px;
    }

    .debug-tag {
        color: #e74c3c;
        font-size: 14px;
        margin-left: 6px;
    }

    .developer-name {
        font-size: 18px;
        font-weight: bold;
        color: var(--main-text-color);
    }

    .developer-role {
        font-size: 13px;
        color: var(--secondary-text-color);
        margin-top: 2px;
    }

    .dev-info {
        margin-left: 15px;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .developer {
        width: 100%;
        margin-bottom: 20px;
        margin-top: 10px;
    }

    .social-links {
        display: flex;
        gap: 10px;
        margin-top: 5px;
    }

    .app-developers,
    .update-section {
        width: 80%;
    }

    .developer img {
        border-radius: 50%;
        object-fit: cover;
    }

    .about-program-title {
        margin-top: 40px;
        width: 80%;
    }

    .app-info {
        height: auto;
        justify-content: center;
        margin-left: 20px;
    }

    .app-title {
        margin-top: 30px;
        font-size: 24px;
        font-weight: bold;
        color: var(--main-text-color);
        width: fit-content;
    }

    .update-card {
        background-color: var(--alt-background-color);
        border-radius: 12px;
        padding: 16px 24px;
        margin-top: 12px;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
    }

    .version-label {
        font-size: 13px;
        color: var(--secondary-text-color);
    }

    .version-number {
        font-size: 20px;
        font-weight: bold;
        color: var(--select-button-left-color);
        margin-top: 4px;
    }

    .update-actions {
        align-items: flex-end;
        gap: 8px;
    }

    .update-btn {
        background-color: var(--select-button-left-color);
        color: var(--main-text-color);
        padding: 10px 20px;
        border-radius: 8px;
        font-weight: bold;
        font-size: 14px;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .update-btn:hover:not(.disabled) {
        background-color: var(--player-middle-button-select);
    }

    .update-btn.disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .update-status-text {
        font-size: 13px;
        margin-top: 6px;
        align-items: flex-end;
    }

    .update-status-text.success {
        color: #2ecc71;
    }

    .update-status-text.available {
        color: #f1c40f;
    }

    .open-release-btn {
        margin-top: 4px;
        background: transparent;
        color: var(--select-button-left-color);
        text-decoration: underline;
        font-size: 12px;
        cursor: pointer;
    }

    .original-devs-container {
        margin-top: 15px;
        width: 100%;
    }

    .toggle-original-devs-btn {
        background: transparent;
        color: var(--secondary-text-color);
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        padding: 8px 0;
        text-align: left;
        transition: color 0.2s;
    }

    .toggle-original-devs-btn:hover {
        color: var(--main-text-color);
    }

    .original-devs-list {
        background-color: var(--alt-background-color);
        border-radius: 12px;
        padding: 15px 20px;
        margin-top: 8px;
    }
</style>
