<script>
    import { Pages } from "./pages.js";
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

    const unsubGuiSettings = guiSettingsRaw.subscribe((value) => {
        guiSettings = value;
        if (guiSettings?.theme) {
            document.body.className = `${guiSettings.theme}-theme`;
        }
    });

    const unsubEndpointUrl = endpointUrlRaw.subscribe((value) => {
        endpointUrl = value;
    });

    if (guiSettings?.theme) {
        document.body.className = `${guiSettings.theme}-theme`;
    }

    let utoken;

    let isFullscreen = false;
    let availableGPU = false;

    const user_token = localStorageWritable("user_token", null);
    const unsubUserToken = user_token.subscribe((value) => {
        try {
            utoken = value ? JSON.parse(value) : null;
        } catch (e) {
            utoken = null;
        }
        if (window.anixApi?.client) {
            window.anixApi.client.token = utoken?.token || null;
        }
    });

    let firstRun;

    const firstRunRaw = localStorageWritable("first_run", true);
    const unsubFirstRun = firstRunRaw.subscribe((value) => (firstRun = value));

    discordRPC.setActivity({
        type: 3,
        state: "Ожидание...",
        largeImageKey: "anidesk-transparent",
        largeImageText: "AniXFlow - Anixart Client",
        instance: true,
        buttons: [
            { label: "Ссылка на клиент", url: "https://github.com/MjKey/AniXFlow" },
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

    // Network Timeout Patch (8-second timeout for non-critical requests + cancellation manager)
    window.addEventListener('unhandledrejection', (event) => {
        if (event.reason && String(event.reason).includes('[AnixartJS]')) {
            console.warn('[AniXFlow Suppressed API Error]:', event.reason.message || event.reason);
            event.preventDefault();
        }
    });

    const activeControllers = new Set();

    window.cancelActiveRequests = function () {
        for (const controller of activeControllers) {
            controller.abort();
        }
        activeControllers.clear();
    };

    const originalFetch = window.fetch;
    window.fetch = async function (url, options = {}) {
        const urlStr = url.toString();
        if (
            urlStr.includes("localhost") ||
            urlStr.includes("127.0.0.1") ||
            urlStr.startsWith("file:") ||
            urlStr.startsWith("anixflow:") ||
            urlStr.startsWith("anixflow-cache:")
        ) {
            return originalFetch(url, options);
        }

        if (options.signal) {
            return originalFetch(url, options);
        }

        const isCritical = 
            urlStr.includes("/profile") || 
            urlStr.includes("/auth") || 
            urlStr.includes("/notification") || 
            urlStr.includes("/settings") ||
            urlStr.includes("/history") ||
            urlStr.includes("/watch") ||
            urlStr.includes("/favorite") ||
            urlStr.includes("/list/") ||
            urlStr.includes("/comment/") ||
            urlStr.includes("/vote/");

        const controller = new AbortController();
        if (!isCritical) {
            activeControllers.add(controller);
        }

        const timeoutId = setTimeout(() => {
            controller.isTimeout = true;
            controller.abort();
        }, 8000);

        try {
            const res = await originalFetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            activeControllers.delete(controller);
            return res;
        } catch (err) {
            clearTimeout(timeoutId);
            activeControllers.delete(controller);
            if (err instanceof Error && err.name === 'AbortError' && controller.isTimeout) {
                throw new Error('Timeout');
            }
            throw err;
        }
    };

    const paginatedProps = new Set([
        'filter', 'all', 'getCollectionFavorites', 'getCollectionReleases',
        'getFriends', 'getVotedReleases', 'getBookmarks', 'getFavorites',
        'getComments', 'getRelatedReleases', 'releases', 'getCommentReplies'
    ]);

    function getContentArray(r) {
        if (r && Array.isArray(r.content)) return r.content;
        if (r && r.releases && Array.isArray(r.releases.content)) return r.releases.content;
        return null;
    }

    function setContentArray(r, arr) {
        if (r && Array.isArray(r.content)) r.content = arr;
        else if (r && r.releases && Array.isArray(r.releases.content)) r.releases.content = arr;
    }

    const pageIndex1Props = new Set([
        'getCollectionReleases', 'getComments', 'getRelatedReleases', 
        'getCommentReplies', 'getVotedReleases'
    ]);

    function wrapAnixApi(endpoints) {
        const handler = {
            get(target, prop) {
                const val = target[prop];
                if (typeof val === 'function') {
                    return async function(...args) {
                        if (!paginatedProps.has(prop)) {
                            return val.apply(target, args);
                        }

                        let pageValue = -1;
                        let pageIndex = -1;
                        
                        if (pageIndex1Props.has(prop)) {
                            if (typeof args[1] === 'number') {
                                pageValue = args[1]; pageIndex = 1;
                            } else if (typeof args[1] === 'object' && args[1] !== null && typeof args[1].page === 'number') {
                                pageValue = args[1].page; pageIndex = 'in_obj_1';
                            }
                        } else if (typeof args[0] === 'number') {
                            pageValue = args[0]; pageIndex = 0;
                        } else if (args[0] !== null && typeof args[0] === 'object' && typeof args[0].page === 'number') {
                            pageValue = args[0].page; pageIndex = 'in_obj';
                        } else if (args.length > 1) {
                            if (typeof args[1] === 'number') {
                                pageValue = args[1]; pageIndex = 1;
                            } else if (typeof args[1] === 'object' && args[1] !== null && typeof args[1].page === 'number') {
                                pageValue = args[1].page; pageIndex = 'in_obj_1';
                            }
                        }

                        if (pageValue === -1) {
                            return val.apply(target, args);
                        }

                        const pageA = pageValue * 2;
                        const pageB = pageValue * 2 + 1;

                        const argsA = JSON.parse(JSON.stringify(args));
                        if (pageIndex === 0 || pageIndex === 1) argsA[pageIndex] = pageA;
                        else if (pageIndex === 'in_obj') argsA[0].page = pageA;
                        else if (pageIndex === 'in_obj_1') argsA[1].page = pageA;

                        const argsB = JSON.parse(JSON.stringify(args));
                        if (pageIndex === 0 || pageIndex === 1) argsB[pageIndex] = pageB;
                        else if (pageIndex === 'in_obj') argsB[0].page = pageB;
                        else if (pageIndex === 'in_obj_1') argsB[1].page = pageB;

                        try {
                            const [resA, resB] = await Promise.all([
                                val.apply(target, argsA),
                                val.apply(target, argsB).catch(() => null)
                            ]);

                            if (resA) {
                                const contentA = getContentArray(resA);
                                const contentB = resB ? getContentArray(resB) : null;
                                if (contentA && contentB && Array.isArray(contentB)) {
                                    setContentArray(resA, contentA.concat(contentB));
                                }
                                return resA;
                            }
                            return resA;
                        } catch (e) {
                            return val.apply(target, args);
                        }
                    };
                }
                if (typeof val === 'object' && val !== null) {
                    return new Proxy(val, handler);
                }
                return val;
            }
        };
        return new Proxy(endpoints, handler);
    }

    /**
     * Глобальные переменные
     */
    window.baseSettings = settings.getAll().then((res) => (window.baseSettings = res)).catch((e) => console.error("Error fetching baseSettings:", e));
    window.versions = prc
        .getVersions()
        .then((versions) => (window.versions = versions))
        .catch((e) => console.error("Error fetching versions:", e));
    window.anixApi = wrapAnixApi(new Anixart({
        token: utoken?.token,
        baseUrl: `https://${endpointUrl}`,
    }).endpoints);
    if (utoken?.token) {
        anixApi.client.token = utoken.token;
    }
    window.profileInfo = (utoken && utoken.id)
        ? anixApi.profile
              .info(utoken.id)
              .then((x) => (profileInfo = x.profile))
              .catch((e) => console.error("Error fetching profileInfo:", e))
        : null;
    window.profileSettings = {
        main: null,
        socials: null,
        login: null,
    };
    window.availableGPU = utils
        .checkGPUSupport()
        .then((res) => (availableGPU = res))
        .catch((e) => console.error("Error checking GPU support:", e));

    if (utoken) {
        anixApi.settings
            .getCurrentProfileSettings()
            .then((x) => (profileSettings.main = x))
            .catch((e) => console.error("Error fetching profileSettings.main:", e));
        anixApi.settings
            .getSocial()
            .then((x) => (profileSettings.socials = x))
            .catch((e) => console.error("Error fetching profileSettings.socials:", e));
        anixApi.settings
            .getLoginInfo()
            .then((x) => (profileSettings.login = x))
            .catch((e) => console.error("Error fetching profileSettings.login:", e));

        anixApi.notification
            .countNotifications()
            .then((x) => notificationCount.set(x.count))
            .catch((e) => console.error("Notification count error:", e));
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
                            await new Promise((resolve) => setTimeout(resolve, 200));
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
    let timeoutBookmarkCheck;

    let isDebug = false;
    let unsubNavigate = null;
    let unsubFullscreen = null;

    onMount(async () => {
        if (window.prc?.isDebug) {
            isDebug = await window.prc.isDebug();
        }

        if (window.elecWindow?.isFullScreen) {
            isFullscreen = await window.elecWindow.isFullScreen();
        }
        if (window.elecWindow?.onFullscreenChange) {
            unsubFullscreen = window.elecWindow.onFullscreenChange((isFs) => {
                isFullscreen = isFs;
            });
        }

        if (window.notify?.onNavigateRelease) {
            unsubNavigate = window.notify.onNavigateRelease((releaseId) => {
                if (window.updateViewportComponent) {
                    window.updateViewportComponent(Pages.RELEASE, { id: releaseId });
                }
            });
        }

        // Check bookmark episode updates after initial launch
        timeoutBookmarkCheck = setTimeout(checkBookmarkNewEpisodes, 10000);
        intervalBookmarkCheck = setInterval(checkBookmarkNewEpisodes, 300000); // каждые 5 минут

        intervalNotifications = setInterval(() => {
            if (window.anixApi?.notification) {
                anixApi.notification
                    .countNotifications()
                    .then((x) => notificationCount.set(x.count))
                    .catch((e) => console.error("Notification interval count error:", e));
            }
        }, 1800000); // Раз в 30 минут
    });

    onDestroy(() => {
        if (unsubGuiSettings) unsubGuiSettings();
        if (unsubEndpointUrl) unsubEndpointUrl();
        if (unsubUserToken) unsubUserToken();
        if (unsubFirstRun) unsubFirstRun();
        if (unsubNavigate) unsubNavigate();
        if (unsubFullscreen) unsubFullscreen();
        if (timeoutBookmarkCheck) clearTimeout(timeoutBookmarkCheck);
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
