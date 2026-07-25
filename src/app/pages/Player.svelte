<!--Anidesk player-->

<script>
    import { Pages } from "../pages.js";
    export let args;
    import { localStorageWritable } from "@babichjacob/svelte-localstorage";
    import { onDestroy, onMount } from "svelte";
    import PlayerGui from "../components/player/PlayerGUI.svelte";
    import { AniLibriaParser, SibnetParser, KodikParser } from "anixartjs";
    import { playerSettingsStore } from "../components/stores/pageHistory.js";
    import utils from "../utils";
    import { getSkipTimes } from "../utils/skipTimes.js";
    import { savePosition, getSavedPosition, clearPosition } from "../utils/watchPosition.js";
    import { searchShikimoriAnimeGraphQL, getShikimoriUserRate, saveShikimoriUserRate } from "../utils/shikimori.js";

    // Managers
    import { DiscordRpcManager } from "../components/stores/discordRpcManager.js";
    import { SleepTimer } from "../components/stores/sleepTimer.js";
    import { HlsManager } from "../components/stores/hlsManager.js";
    import { VolumeManager } from "../components/stores/volumeManager.js";
    import { HotkeyManager } from "../components/stores/hotkeyManager.js";
    import { UpscaleRenderer } from "../components/stores/upscaleRenderer.js";

    // Manager instances
    let hlsManager = new HlsManager();
    let volumeManager = new VolumeManager();
    let rpcManager = null;
    let sleepTimerManager = null;
    let hotkeyManager = null;
    let upscaleRenderer = null;

    let currentTime = "0:00";
    let durationTime = "0:00";
    let upscaleSettings;
    let playerSettings;
    let playingSettings;
    let volPercent = 100;

    let defaultCanvasSize = {
        width: screen.width,
        height: screen.height,
    };

    let video;
    let canvas;
    let timePos;
    let volControl;
    let timeout;
    let mainDiv;
    let currentEpisode;
    let startTimestamp;

    let progressPercent = 0;
    let loadedPercent = 0;

    let isHidden = false;
    let isPaused = false;
    let isTimePosClick = false;
    let isFullscreen = false;

    let skipTimes = { op: null, ed: null };
    let activeSkipType = null;
    let isOpAutoSkipped = false;
    let isEdAutoSkipped = false;
    let skipToastMessage = null;
    let skipToastTimeout = null;
    let resumeToastMessage = null;
    let resumeToastTimeout = null;
    let hasRestoredPosition = false;
    let lastWatchSaveTime = 0;
    let upscaleEnabled = false;
    let loading = true;
    let forceHideActive = false;
    let unsubFullscreen = null;
    let availableGPU = false;
    let sleepTimerLabel = "Выкл";
    let activeEpisodeRequestId = 0;
    let showReloadHint = false;
    let reloadHintTimeout = null;

    function resetReloadHintTimer() {
        showReloadHint = false;
        if (reloadHintTimeout) clearTimeout(reloadHintTimeout);
        reloadHintTimeout = setTimeout(() => {
            if (loading) {
                showReloadHint = true;
            }
        }, 3500);
    }

    async function reloadPlayer() {
        showReloadHint = false;
        loading = true;
        showSkipToast("Обновление источника...");
        resetReloadHintTimer();
        const ep = currentEpisode || args?.currentEpisode;
        if (ep) {
            await playVideo(ep);
        }
    }

    function getReleaseId() {
        return args?.release?.id || args?.id || null;
    }

    function performRestartVideo() {
        if (video) {
            video.currentTime = 0;
            resumeToastMessage = null;
            const relId = getReleaseId();
            const ep = currentEpisode || args?.currentEpisode;
            if (relId && ep) {
                clearPosition(relId, ep);
            }
        }
    }

    function tryRestoreWatchPosition() {
        if (hasRestoredPosition || playerSettings?.rememberPosition === false || !video || !video.duration) return;

        const relId = getReleaseId();
        const ep = currentEpisode || args?.currentEpisode;
        if (!relId || !ep) return;

        const saved = getSavedPosition(relId, ep);
        if (saved && typeof saved.time === 'number' && saved.time > 5 && !saved.completed && (video.duration - saved.time) > 15) {
            video.currentTime = saved.time;
            hasRestoredPosition = true;
            resumeToastMessage = `Продолжено с ${utils.returnFormatedTime(saved.time)}`;
            if (resumeToastTimeout) clearTimeout(resumeToastTimeout);
            resumeToastTimeout = setTimeout(() => {
                resumeToastMessage = null;
            }, 6000);
        } else {
            hasRestoredPosition = true;
        }
    }

    async function syncShikimoriWatchProgress(ep) {
        if (baseSettings?.SyncShikimoriOnWatch === false) return;
        const shikiToken = localStorage.getItem("shikimori_token");
        const shikiUserStr = localStorage.getItem("shikimori_user");
        if (!shikiToken || !shikiUserStr || !args?.release) return;

        try {
            const shikiUser = JSON.parse(shikiUserStr);
            const epNum = ep?.position || 1;
            const shikiAnime = await searchShikimoriAnimeGraphQL(args.release.title_original, args.release.title_ru, shikiToken);
            if (!shikiAnime) return;

            const userRate = await getShikimoriUserRate(shikiAnime.id, shikiToken, shikiUser.id);
            const currentWatched = userRate?.episodes || 0;
            if (epNum > currentWatched) {
                const maxEp = shikiAnime.episodes || 0;
                const isCompleted = maxEp > 0 && epNum >= maxEp;
                const status = isCompleted ? "completed" : (userRate?.status || "watching");
                await saveShikimoriUserRate(shikiAnime.id, shikiToken, shikiUser.id, status, epNum, userRate?.id);
            }
        } catch (e) {
            console.error("[Shikimori] Progress sync error:", e);
        }
    }

    function trySaveWatchPosition() {
        if (playerSettings?.rememberPosition === false || !video || !video.duration || isNaN(video.currentTime)) return;
        const now = Date.now();
        if (now - lastWatchSaveTime >= 2000) {
            lastWatchSaveTime = now;
            const relId = getReleaseId();
            const ep = currentEpisode || args?.currentEpisode;
            if (relId && ep) {
                savePosition(relId, ep, video.currentTime, video.duration);
                if (video.currentTime / video.duration >= 0.75) {
                    syncShikimoriWatchProgress(ep);
                }
            }
        }
    }

    function showSkipToast(msg) {
        skipToastMessage = msg;
        if (skipToastTimeout) clearTimeout(skipToastTimeout);
        skipToastTimeout = setTimeout(() => {
            skipToastMessage = null;
        }, 3000);
    }

    function checkAndTriggerSkip(cTime) {
        if (!video || !video.duration || cTime == null) return;

        const isAutoOp = Boolean(playerSettings?.autoSkipOpening);
        const isAutoEd = Boolean(playerSettings?.autoSkipEnding);

        if (skipTimes.op && cTime >= skipTimes.op.start && cTime < skipTimes.op.end) {
            if (isAutoOp && !isOpAutoSkipped) {
                isOpAutoSkipped = true;
                performSkipOp();
            } else if (!isAutoOp) {
                activeSkipType = 'op';
            }
        } else if (skipTimes.ed && cTime >= skipTimes.ed.start && cTime < skipTimes.ed.end) {
            if (isAutoEd && !isEdAutoSkipped) {
                isEdAutoSkipped = true;
                performSkipEd();
            } else if (!isAutoEd) {
                activeSkipType = 'ed';
            }
        } else {
            activeSkipType = null;
        }
    }

    async function updateSkipTimes() {
        isOpAutoSkipped = false;
        isEdAutoSkipped = false;
        activeSkipType = null;
        skipTimes = { op: null, ed: null };

        if (!args || !args.release) return;
        const ep = currentEpisode || args.currentEpisode;
        const currentSourceName = args.episodes?.[0]?.source?.name ?? null;

        skipTimes = await getSkipTimes(args.release, ep, currentSourceName);

        const isAutoSkipEnabled = Boolean(playerSettings?.autoSkipOpening || playerSettings?.autoSkipEnding);
        if (currentSourceName === "Kodik" && skipTimes?.kodikMissing && isAutoSkipEnabled) {
            if (skipTimes.op || skipTimes.ed) {
                showSkipToast("В Kodik нет таймкодов (взяты из AniSkip)");
            } else {
                showSkipToast("В Kodik нет таймкодов автопропуска");
            }
        }

        if (video && video.currentTime != null) {
            checkAndTriggerSkip(video.currentTime);
        }
    }

    function performSkipOp() {
        if (skipTimes.op && video) {
            video.currentTime = Number(skipTimes.op.end);
            showSkipToast("Опенинг пропущен");
            activeSkipType = null;
        }
    }

    function performSkipEd() {
        if (skipTimes.ed && video) {
            video.currentTime = Number(skipTimes.ed.end);
            showSkipToast("Эндинг пропущен");
            activeSkipType = null;
        }
    }

    let unsubPlayerSettings = playerSettingsStore.subscribe((value) => {
        playerSettings = {
            ...utils.playerDefaultSettings,
            ...(value || {}),
        };
    });

    const playingSettingsRaw = localStorageWritable(
        "playingSettings",
        utils.playingDefaultSettings,
    );

    let unsubPlayingSettings = playingSettingsRaw.subscribe((value) => {
        playingSettings = value;
    });

    const upscaleSettingsRaw = localStorageWritable(
        "upscaleSettings",
        utils.upscaleDefaultSettings,
    );

    let unsubUpscaleSettings = upscaleSettingsRaw.subscribe((value) => {
        upscaleSettings = value;
    });

    function updatePlayingSettings(patch) {
        playingSettings = {
            ...playingSettings,
            ...patch,
        };
        playingSettingsRaw.set(playingSettings);
    }

    function persistPlayerSettings(nextSettings) {
        playerSettings = nextSettings;
        playerSettingsStore.set(nextSettings);
        localStorage.setItem("playerSettings", JSON.stringify(nextSettings));
    }

    function rememberPlaybackSelection(source) {
        if (!playingSettings?.rememberSelection || !source) return;

        updatePlayingSettings({
            lastDubberId: source.type?.id ?? null,
            lastDubberName: source.type?.name ?? null,
            lastSourceId: source.id ?? null,
            lastSourceName: source.name ?? null,
        });
    }

    let aspectRatio = `aspect-${playerSettings.defaultAspectRatio}`;

    function changeAspectRatio(aspect) {
        playerSettings.defaultAspectRatio = aspect;
        aspectRatio = `aspect-${aspect}`;
    }

    function handleSetVolume(vol, persist = true) {
        volPercent = volumeManager.setVolume(
            vol,
            video,
            volControl,
            playerSettings,
            persistPlayerSettings,
            persist
        );
    }

    function forceHide() {
        isHidden = true;
        forceHideActive = true;
        if (timeout) {
            clearTimeout(timeout);
        }
        setTimeout(() => {
            forceHideActive = false;
        }, 1000);
    }

    function hideOnIdle() {
        if (forceHideActive) return;

        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(() => {
            if (!isHidden) {
                isHidden = true;
            }
        }, playerSettings.timeHideInterface);

        if (isHidden) {
            isHidden = false;
        }
    }

    async function changeUpscale(enabled) {
        upscaleEnabled = enabled;
        await renderUpscale();
    }

    async function renderUpscale() {
        if (!availableGPU) return;
        canvas = await waitForElm(".player-canvas");
        if (!upscaleRenderer && video && canvas) {
            upscaleRenderer = new UpscaleRenderer(video, canvas, defaultCanvasSize);
        }
        if (upscaleRenderer) {
            await upscaleRenderer.render(upscaleEnabled, upscaleSettings?.mode ?? 0);
        }
    }

    async function changeQuality(quality) {
        const qualitySrc = args.availableQuality[String(quality)]?.src;
        if (!qualitySrc) return;
        hlsManager.changeQuality(qualitySrc);
    }

    function changeSleepTimer(config) {
        if (sleepTimerManager) {
            sleepTimerManager.change(config);
        }
    }

    onMount(async () => {
        if (window.availableGPU) {
            window.availableGPU.then((res) => (availableGPU = res));
        }
        if (window.elecWindow?.isFullScreen) {
            isFullscreen = await window.elecWindow.isFullScreen();
        }
        if (window.elecWindow?.onFullscreenChange) {
            unsubFullscreen = window.elecWindow.onFullscreenChange((isFs) => {
                isFullscreen = isFs;
            });
        }
        document.addEventListener("mousemove", hideOnIdle);
        init();
    });

    async function playVideo(episode) {
        resetReloadHintTimer();
        const requestId = ++activeEpisodeRequestId;
        const relId = getReleaseId();
        const prevEp = currentEpisode || args?.currentEpisode;
        if (video && video.duration && relId && prevEp) {
            savePosition(relId, prevEp, video.currentTime, video.duration);
        }
        hasRestoredPosition = false;
        resumeToastMessage = null;
        updateSkipTimes();
        let availableQuality, link;
        let source =
            typeof episode.source == "number"
                ? args.episodes.find((x) => episode.source == x.source["@id"])
                      .source
                : episode.source;

        rememberPlaybackSelection(source);

        switch (source.name) {
            case "Kodik":
                let aQ = {};
                const kLinks = await KodikParser.getDirectLinks(episode.url);
                for (const [key, value] of Object.entries(kLinks || {})) {
                    const cleanKey = String(key).replace(/p$/i, '');
                    const srcUrl = Array.isArray(value) ? value[0]?.src : value?.src;
                    if (srcUrl) {
                        aQ[cleanKey] = { src: srcUrl };
                    }
                }
                availableQuality = aQ;
                break;

            case "Liberty":
            case "Libria":
                await utils.fallback(async () => {
                    availableQuality = await window.prc.parseLibria(
                        episode.url,
                    );
                    if (!availableQuality) return false;
                    return true;
                }, 3);
                break;

            case "Sibnet":
                await utils.fallback(async () => {
                    const link = await (SibnetParser.getDirectLinks ? SibnetParser.getDirectLinks(episode.url) : SibnetParser.getDirectLink(episode.url));
                    if (!link) return false;

                    const srcUrl = typeof link === 'string' ? link : (link["720"]?.src || link["720"]?.[0]?.src || link.src || link);
                    availableQuality = {
                        "720": {
                            src: srcUrl,
                        },
                    };
                    return true;
                }, 3);
                break;
        }

        if (requestId !== activeEpisodeRequestId) return;

        const url =
            availableQuality?.[String(playingSettings.defaultQuality)]?.src ??
            availableQuality?.["1080"]?.src ??
            availableQuality?.["720"]?.src ??
            availableQuality?.["480"]?.src ??
            availableQuality?.["360"]?.src ??
            Object.values(availableQuality || {})[0]?.src;

        args.availableQuality = availableQuality || {};
        if (url) {
            link = url.startsWith('//') ? `https:${url}` : url;
            hlsManager.loadSource(link, true);
            args.src = link;
        }

        if (typeof window !== 'undefined' && window.analytics) {
            window.analytics.trackEvent("play_anime", {
                source: source.name,
                name: episode.name,
                releaseTitle: args.release.title_ru,
                dubber: source.type.name,
            });
        }

        startTimestamp = Date.now();
        if (rpcManager) {
            rpcManager.setPlaying(episode.name, video?.currentTime, video?.duration);
        }
    }

    async function init() {
        rpcManager = new DiscordRpcManager({
            releaseId: args.release.id,
            releaseTitle: args.release.title_ru,
        });

        sleepTimerManager = new SleepTimer({
            getAction: () => playingSettings?.sleepTimerAction ?? "pause",
            onLabelChange: (lbl) => (sleepTimerLabel = lbl),
            handlers: {
                pause: () => video?.pause(),
                closePlayer: () => updateViewportComponent(Pages.RELEASE, { id: args.release.id }),
            },
        });

        currentEpisode = args.currentEpisode;

        mainDiv = await waitForElm(".anidesk-player");
        video = await waitForElm(".player-video");

        hlsManager.init(video, (percent) => {
            loadedPercent = percent;
        });

        const syncDuration = () => {
            if (video && video.duration && !isNaN(video.duration) && video.duration > 0) {
                durationTime = utils.returnFormatedTime(video.duration);
            }
        };

        video.onloadedmetadata = () => {
            loading = true;
            syncDuration();
            tryRestoreWatchPosition();
        };

        video.ondurationchange = () => {
            syncDuration();
        };

        video.oncanplay = () => {
            syncDuration();
        };

        video.onwaiting = () => {
            loading = false;
        };

        video.onplaying = () => {
            loading = false;
            syncDuration();
            tryRestoreWatchPosition();
        };

        video.onended = async () => {
            const relId = getReleaseId();
            const ep = currentEpisode || args?.currentEpisode;
            if (relId && ep && video.duration) {
                savePosition(relId, ep, video.duration, video.duration);
            }

            const triggered = await sleepTimerManager.onEpisodeEnd();
            if (triggered) return;

            if (playerSettings?.autoplayEpisode) {
                let e = args.episodes.find(
                    (x) => x.position == currentEpisode.position + 1,
                );

                if (e) {
                    currentEpisode = e;
                    await playVideo(currentEpisode);
                }
            }
        };

        video.ontimeupdate = () => {
            if (!video || !video.duration) return;
            currentTime = utils.returnFormatedTime(video.currentTime);
            progressPercent = (video.currentTime / video.duration) * 100;
            if (durationTime === "0:00" || durationTime === "00:00") {
                syncDuration();
            }

            tryRestoreWatchPosition();
            trySaveWatchPosition();
            checkAndTriggerSkip(video.currentTime);
        };

        video.onpause = () => {
            isPaused = true;
            loading = false;
            if (rpcManager) rpcManager.setPaused(currentEpisode.name);
        };

        video.onplay = () => {
            isPaused = false;
            loading = false;
            syncDuration();
            if (rpcManager) rpcManager.setPlaying(currentEpisode.name, video.currentTime, video.duration);
        };

        // Start loading the stream immediately before non-critical UI awaits
        if (!args.src || args.src === "https:undefined" || args.src === "undefined") {
            if (currentEpisode) {
                playVideo(currentEpisode);
            }
        } else {
            hlsManager.loadSource(args.src, true);
        }

        // Initialize non-blocking UI controls & integrations asynchronously
        (async () => {
            try {
                await volumeManager.loadPersistedVolume();
                const initialVol = volumeManager.getInitialVolume(playerSettings, utils.playerDefaultSettings);
                video.volume = initialVol;

                volControl = await waitForElm("#volume-position");
                volPercent = volumeManager.setVolume(video.volume, video, volControl, playerSettings, persistPlayerSettings, true);

                volControl.oninput = () => {
                    handleSetVolume(volControl.value);
                };
            } catch (e) {
                console.error("[Player] Volume init error:", e);
            }
        })();

        let source =
            typeof args.currentEpisode.source == "number"
                ? args.episodes.find(
                      (x) => args.currentEpisode.source == x.source["@id"],
                  ).source
                : args.currentEpisode.source;

        rememberPlaybackSelection(source);

        if (typeof window !== 'undefined' && window.analytics) {
            window.analytics.trackEvent("play_anime", {
                source: source.name,
                name: args.currentEpisode.name,
                releaseTitle: args.release.title_ru,
                dubber: source.type.name,
            });
        }

        hotkeyManager = new HotkeyManager({
            getHotkeys: () => playerSettings?.hotkeys ?? {},
            handlers: {
                hotkeyPlayPause: () => (isPaused ? video.play() : video.pause()),
                hotkeyMute: () => (video.muted = !video.muted),
                hotkeyFullscreen: () =>
                    isFullscreen
                        ? window.elecWindow?.exitFullscreen()
                        : window.elecWindow?.enterFullscreen(),
                hotkeyForward: () => (video.currentTime += 10),
                hotkeyBackward: () => (video.currentTime -= 10),
                hotkeySkipOpening: () => {
                    if (skipTimes.op && video.currentTime >= skipTimes.op.start && video.currentTime < skipTimes.op.end) {
                        performSkipOp();
                    } else if (skipTimes.ed && video.currentTime >= skipTimes.ed.start && video.currentTime < skipTimes.ed.end) {
                        performSkipEd();
                    } else {
                        video.currentTime += 85;
                    }
                },
                hotkeyNextEpisode: () => {
                    let idx = args.episodes.findIndex((x) => x.position == currentEpisode.position);
                    let e = args.episodes[idx + 1];
                    if (e) {
                        currentEpisode = e;
                        playVideo(currentEpisode);
                    }
                },
                hotkeyPrevEpisode: () => {
                    let idx = args.episodes.findIndex((x) => x.position == currentEpisode.position);
                    let p = args.episodes[idx - 1];
                    if (p) {
                        currentEpisode = p;
                        playVideo(currentEpisode);
                    }
                },
                onEscape: () => {
                    if (isFullscreen) {
                        window.elecWindow?.exitFullscreen();
                        return;
                    }
                    updateViewportComponent(Pages.RELEASE, { id: args.release.id });
                },
                onWheel: (deltaY) => {
                    if (deltaY > 0) {
                        handleSetVolume(video.volume - 0.05);
                    } else if (deltaY < 0) {
                        handleSetVolume(video.volume + 0.05);
                    }
                },
            },
        });
        hotkeyManager.attach();

        updateSkipTimes();

        if (availableGPU) {
            renderUpscale().catch((e) => console.error("[Player] Upscale init error:", e));
        }

        if (rpcManager) {
            rpcManager.setPlaying(currentEpisode.name, video.currentTime, video.duration);
        }
    }

    onDestroy(() => {
        const relId = getReleaseId();
        const ep = currentEpisode || args?.currentEpisode;
        if (video && video.duration && relId && ep) {
            savePosition(relId, ep, video.currentTime, video.duration);
            if (video.currentTime / video.duration >= 0.75) {
                syncShikimoriWatchProgress(ep);
            }
        }

        if (rpcManager) {
            rpcManager.clear();
            rpcManager.destroy();
            rpcManager = null;
        }

        if (unsubPlayerSettings) unsubPlayerSettings();
        if (unsubPlayingSettings) unsubPlayingSettings();
        if (unsubUpscaleSettings) unsubUpscaleSettings();
        if (unsubFullscreen) unsubFullscreen();
        if (sleepTimerManager) sleepTimerManager.clear();
        if (hotkeyManager) hotkeyManager.detach();
        if (hlsManager) hlsManager.destroy();

        clearTimeout(skipToastTimeout);
        clearTimeout(resumeToastTimeout);

        document.removeEventListener("mousemove", hideOnIdle);

        if (video) {
            if (!video.muted) {
                volumeManager.syncPersistedVolume(video, playerSettings, persistPlayerSettings);
            }
            video.onpause = null;
            video.onplay = null;
            video.ontimeupdate = null;
            video.onloadedmetadata = null;
            video.onwaiting = null;
            video.onplaying = null;
            video.onended = null;
            video = null;
        }

        if (volControl) {
            volControl.oninput = null;
        }
        clearTimeout(timeout);
    });
</script>

<div class="anidesk-player full">
    <PlayerGui
        {playVideo}
        {args}
        {isHidden}
        {forceHide}
        bind:isFullscreen
        {isPaused}
        {video}
        {isTimePosClick}
        {timePos}
        {progressPercent}
        {loadedPercent}
        {volControl}
        {canvas}
        {mainDiv}
        {currentTime}
        {durationTime}
        bind:cEpisode={currentEpisode}
        {reloadPlayer}
        transparentPercent={playerSettings.opacityInterface}
        {changeQuality}
        {changeUpscale}
        {upscaleEnabled}
        {changeAspectRatio}
        {changeSleepTimer}
        {sleepTimerLabel}
        aspectRatio={utils.aspectRatioValues.find(
            (x) => x.value == playerSettings.defaultAspectRatio,
        ).label}
        bind:volumePercent={volPercent}
        {activeSkipType}
        {skipTimes}
        hasSkipTimes={!!(skipTimes?.op || skipTimes?.ed)}
        {skipToastMessage}
        {resumeToastMessage}
        {performRestartVideo}
        {performSkipOp}
        {performSkipEd}
    />

    {#if loading}
        <div class="loader-box flex-column">
            <span class="loader"></span>
            {#if showReloadHint}
                <button class="reload-hint-btn flex-row" onclick={reloadPlayer} title="Перезагрузить плеер">
                    <img src="./assets/icons/refresh.svg" width="14" height="14" alt="refresh" style="filter: invert(1);" />
                    <span>Обновить плеер</span>
                </button>
            {/if}
        </div>
    {/if}

    {#if availableGPU}
        <canvas
            class="player-canvas {aspectRatio}"
            width={screen.width}
            height={screen.height}
        ></canvas>
    {/if}
    <video
        class="player-video"
        crossorigin="anonymous"
        class:full={!availableGPU}
        class:hide={availableGPU}
    ></video>
</div>

<style>
    .full {
        width: 100%;
        height: 100%;
        overflow: hidden;
    }

    .loader {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 30px;
        height: 30px;
        border: 3px solid var(--player-timeline-progress-color);
        border-bottom-color: transparent;
        border-radius: 50%;
        display: inline-block;
        box-sizing: border-box;
        animation: rotation 1s linear infinite;
        z-index: 1;
    }

    .loader-box {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10;
        align-items: center;
        gap: 24px;
        pointer-events: auto;
    }

    .reload-hint-btn {
        background: rgba(30, 30, 30, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 13px;
        cursor: pointer;
        align-items: center;
        gap: 8px;
        backdrop-filter: blur(8px);
        transition: all 0.2s ease;
        margin-top: 40px;
    }

    .reload-hint-btn:hover {
        background: rgba(50, 50, 50, 0.95);
        border-color: rgba(255, 255, 255, 0.4);
        transform: scale(1.05);
    }

    @keyframes rotation {
        0% {
            transform: translate(-50%, -50%) rotate(0deg);
        }
        100% {
            transform: translate(-50%, -50%) rotate(360deg);
        }
    }

    canvas,
    video {
        cursor: none;
    }

    .player-canvas {
        height: 100%;
        overflow: hidden;
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
    }

    .aspect-16-9 {
        aspect-ratio: 16 / 9;
    }

    .aspect-4-3 {
        aspect-ratio: 4 / 3;
    }

    .aspect-fit {
        width: 100%;
    }

    .anidesk-player {
        background-color: black;
    }
</style>
