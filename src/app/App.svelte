<script>
    import TitleBar from "./components/gui/TitleBar.svelte";
    import LeftMenu from "./components/gui/LeftMenu.svelte";
    import HomePage from "./pages/Home.svelte";
    import { Anixart } from "anixartjs";
    import MetaInfo from "./components/gui/MetaInfo.svelte";
    import Utils from "./utils";
    import { localStorageWritable } from "@babichjacob/svelte-localstorage";
    import BaseModal from "./components/modal/BaseModal.svelte";
    import FirstRunModal from "./components/modal/FirstRunModal.svelte";
    import { notificationCount } from "./components/stores/notificationCount";
    import { fade } from "svelte/transition";
    import { onMount, onDestroy } from "svelte";
    import DebugConsole from "./components/gui/DebugConsole.svelte";

    window.utils = Utils;

    let guiSettings, endpointUrl;

    const guiSettingsRaw = localStorageWritable(
        "guiSettings",
        utils.guiDefaultSettings,
    );

    const endpointUrlRaw = localStorageWritable(
        "endpointUrl",
        "api-s.anixsekai.com",
    );

    guiSettingsRaw.subscribe((value) => {
        guiSettings = value;
    });

    endpointUrlRaw.subscribe((value) => {
        endpointUrl = value;
    });

    document.body.classList = [`${guiSettings.theme}-theme`];

    let utoken;

    let isFullscreen = false;

    const user_token = localStorageWritable("user_token", null);
    user_token.subscribe((value) => (utoken = JSON.parse(value)));

    let firstRun;

    const firstRunRaw = localStorageWritable("first_run", true);
    firstRunRaw.subscribe((value) => (firstRun = value));

    discordRPC.setActivity({
        type: 3,
        state: "Ожидание...",
        largeImageKey: "anidesk-transparent",
        largeImageText: "AniDeskPlus - Anixart Client",
        instance: true,
        buttons: [
            { label: "Ссылка на клиент", url: "https://github.com/MjKey/AniDeskPlus" },
        ],
    });

    window.waitForElm = (selector) => {
        return new Promise((resolve) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver((mutations) => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
        });
    };

    /**
     * Глобальные переменные
     */
    window.baseSettings = settings.getAll().then((res) => (baseSettings = res));
    window.versions = prc
        .getVersions()
        .then((versions) => (window.versions = versions));
    window.anixApi = new Anixart({
        token: utoken?.token,
        baseUrl: `https://${endpointUrl}`,
    }).endpoints;
    window.profileInfo = utoken
        ? anixApi.profile
              .info(utoken?.id)
              .then((x) => (profileInfo = x.profile))
        : null;
    window.profileSettings = {
        main: null,
        socials: null,
        login: null,
    };
    window.avaliableGPU = utils
        .checkGPUSupport()
        .then((res) => (avaliableGPU = res));

    if (utoken) {
        anixApi.settings
            .getCurrentProfileSettings()
            .then((x) => (profileSettings.main = x));
        anixApi.settings.getSocial().then((x) => (profileSettings.socials = x));
        anixApi.settings
            .getLoginInfo()
            .then((x) => (profileSettings.login = x));

        anixApi.notification
            .countNotifications()
            .then((x) => notificationCount.set(x.count));
    }

    async function checkBookmarkNewEpisodes() {
        if (!utoken || !window.anixApi?.bookmark) return;
        const enableNotifs = baseSettings?.EnableEpisodeNotifications ?? true;
        if (!enableNotifs) return;

        const globalPreferredDubber = (baseSettings?.PreferredDubber || "").trim().toLowerCase();
        let preferredDubbersMap = {};
        try {
            preferredDubbersMap = JSON.parse(localStorage.getItem("preferred_dubbers") || "{}");
        } catch (e) {}

        try {
            const res = await window.anixApi.bookmark.getBookmarks(0, 0);
            if (!res || !res.content) return;

            let cachedEpisodes = {};
            try {
                cachedEpisodes = JSON.parse(localStorage.getItem("bookmark_episodes_cache") || "{}");
            } catch (e) {}

            let updatedCache = { ...cachedEpisodes };

            for (const item of res.content) {
                const release = item.release || item;
                if (!release || !release.id) continue;

                const releaseId = release.id;
                const currentEp = release.episodes_released || 0;
                const prevEp = cachedEpisodes[releaseId];

                if (prevEp !== undefined && currentEp > prevEp) {
                    let allowNotif = true;
                    const releaseSpecificDubber = (preferredDubbersMap[releaseId] || "").trim().toLowerCase();
                    const targetDubber = releaseSpecificDubber || globalPreferredDubber;

                    if (targetDubber) {
                        try {
                            const releaseDetails = await window.anixApi.release.get(releaseId);
                            const dubbers = releaseDetails?.release?.types || releaseDetails?.types || releaseDetails?.release?.dubbers || releaseDetails?.dubbers || [];
                            const matchesDubber = dubbers.some(d =>
                                (d.name || d.title || "").toLowerCase().includes(targetDubber)
                            );
                            if (!matchesDubber) {
                                allowNotif = false;
                            }
                        } catch (e) {}
                    }

                    if (allowNotif) {
                        const releaseTitle = release.title_ru || release.title_original || "Аниме";
                        window.notify?.send({
                            title: `Новая серия! (${currentEp} сер.)`,
                            body: `${releaseTitle} — вышла ${currentEp} серия!`,
                            releaseId: releaseId
                        });
                    }
                }

                updatedCache[releaseId] = currentEp;
            }

            localStorage.setItem("bookmark_episodes_cache", JSON.stringify(updatedCache));
        } catch (e) {
            console.error("Error checking bookmark episodes:", e);
        }
    }

    let intervalNotifications;
    let intervalBookmarkCheck;

    let isDebug = false;

    onMount(async () => {
        if (window.prc?.isDebug) {
            isDebug = await window.prc.isDebug();
        }

        if (window.notify?.onNavigateRelease) {
            window.notify.onNavigateRelease((releaseId) => {
                if (window.updateViewportComponent) {
                    window.updateViewportComponent(8, { id: releaseId });
                }
            });
        }

        // Check bookmark episode updates after initial launch
        setTimeout(checkBookmarkNewEpisodes, 10000);
        intervalBookmarkCheck = setInterval(checkBookmarkNewEpisodes, 300000); // каждые 5 минут

        intervalNotifications = setInterval(() => {
            if (window.anixApi?.notification) {
                anixApi.notification
                    .countNotifications()
                    .then((x) => notificationCount.set(x.count));
            }
        }, 1800000); // Раз в 30 минут
    });

    onDestroy(() => {
        if (intervalNotifications) clearInterval(intervalNotifications);
        if (intervalBookmarkCheck) clearInterval(intervalBookmarkCheck);
    });

    let views;

    let viewInfo = {
        viewportComponent: HomePage,
        args: {typeReleases: 0},
    };

    let viewInfoOld = {
        viewportComponent: null,
        args: null,
    };

    let scrollEvent = null;

    window.setViewportScrollEvent = (callback) => {
        scrollEvent = callback;
    };

    window.addEventListener("resize", function handleResize(event) {
        isFullscreen = window.innerHeight === screen.height;
    });
</script>

<main>
    {#if !isFullscreen}
        <TitleBar />
    {/if}
    <div class="main-content" class:fullscreen={isFullscreen}>
        <LeftMenu
            bind:viewportComponent={viewInfo.viewportComponent}
            bind:views
            bind:argsComponent={viewInfo.args}
            bind:viewInfoOld
        />
        {#key viewInfo}
            <MetaInfo />
            <div
                id="viewport"
                class="unselectable"
                tabindex="-1"
                on:scroll={scrollEvent}
                in:fade={{ duration: 200 }}
            >
                <svelte:component
                    this={viewInfo.viewportComponent}
                    args={viewInfo.args}
                ></svelte:component>
                {#if firstRun}
                    <BaseModal
                        modalComponent={FirstRunModal}
                        canCloseOnBackground={false}
                        showed={firstRun}
                        modalSize={{ width: "700px", height: "500px" }}
                        on:closeModal={() => (firstRun = false)}
                    />
                {/if}
            </div>
        {/key}
    </div>
    {#if isDebug}
        <DebugConsole />
    {/if}
</main>

<style>
    .main-content {
        display: flex;
        flex-direction: row;
        height: calc(100vh - 22px);
        width: 100vw;
        margin-top: 22px;
        position: relative;
        background-color: var(--background-color);
        overflow: hidden;
    }

    .fullscreen {
        margin-top: 0px;
        height: 100vh;
    }

    #viewport {
        overflow-y: auto;
        overflow-x: hidden;
        width: 100vw;
        z-index: 0;
        position: relative;
    }

    :global(::-webkit-scrollbar) {
        width: 10px;
        height: 17px;
    }

    /* Track */
    :global(::-webkit-scrollbar-track) {
        background-color: var(--alt-background-color);
        border-radius: 10px;
        opacity: 0.01;
    }

    /* Handle */
    :global(::-webkit-scrollbar-thumb) {
        background: #828282;
        border-radius: 10px;
        box-shadow: inset 0 0 6px var(--scroll-bar-handle-bg-color);
        -webkit-box-shadow: inset 0 0 6px var(--scroll-bar-handle-bg-color);
    }

    :global(::-webkit-scrollbar-thumb:window-inactive) {
        background: var(--scroll-bar-track-bg-color);
    }
</style>
