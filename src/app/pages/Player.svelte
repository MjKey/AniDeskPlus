<!--Anidesk player-->

<script>
    export let args;
    import {
        Original,
        ModeA,
        render,
        ModeBB,
        ModeB,
        DoG,
        BilateralMean,
        CNNM,
        CNNSoftM,
        CNNSoftVL,
        CNNVL,
        CNNUL,
        CNNx2M,
        CNNx2VL,
        DenoiseCNNx2VL,
        GANx3L,
        GANx4UUL,
        GANUUL,
        ModeAA,
        ModeCA,
        CNNx2UL,
        ModeC,
    } from "anime4k-webgpu";
    import { localStorageWritable } from "@babichjacob/svelte-localstorage";
    import { onDestroy } from "svelte";
    import PlayerGui from "../components/player/PlayerGUI.svelte";
    import { onMount } from "svelte";
    import { AniLibriaParser, SibnetParser, KodikParser } from "anixartjs";
    import { playerSettingsStore } from "../components/stores/pageHistory.js";
    import utils from "../utils";
    import { getSkipTimes } from "../utils/skipTimes.js";
    import { savePosition, getSavedPosition, clearPosition } from "../utils/watchPosition.js";

    const upscaleModeMap = {
        0: DoG,
        1: BilateralMean,
        2: CNNM,
        3: CNNSoftM,
        4: CNNSoftVL,
        5: CNNVL,
        6: CNNUL,
        7: GANUUL,
        8: CNNx2M,
        9: CNNx2VL,
        10: DenoiseCNNx2VL,
        11: CNNx2UL,
        12: GANx3L,
        13: GANx4UUL,
        14: ModeA,
        15: ModeB,
        16: ModeC,
        17: ModeAA,
        18: ModeBB,
        19: ModeCA,
    };

    const PLAYER_LAST_VOLUME_KEY = "PlayerLastVolume";
    const PLAYER_SAVE_VOLUME_ENABLED_KEY = "PlayerSaveUserVolumeEnabled";

    let currentTime,
        durationTime,
        upscaleSettings,
        playerSettings,
        playingSettings,
        volPercent,
        persistedVolume = null,
        persistedSaveVolumeEnabled = null;

    let defaultCanvasSize = {
        width: screen.width,
        height: screen.height,
    };

    let video,
        canvas,
        timePos,
        volControl,
        timeout,
        mainDiv,
        hls,
        currentEpisode,
        startTimestamp;

    let progressPercent, loadedPercent;

    let isHidden, isPaused, isTimePosClick, isFullscreen;
    let pressedKeys = new Set();

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
        if (!relId || !ep) {
            console.log('[WatchPosition] Restore check skipped: relId or ep missing', { relId, ep });
            return;
        }

        const saved = getSavedPosition(relId, ep);
        console.log(`[WatchPosition] Restoring check for relId=${relId}, ep=${ep.position || ep.name}:`, saved);

        if (saved && typeof saved.time === 'number' && saved.time > 5 && !saved.completed && (video.duration - saved.time) > 15) {
            console.log(`[WatchPosition] Restored video time to ${saved.time}s`);
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

    function trySaveWatchPosition() {
        if (playerSettings?.rememberPosition === false || !video || !video.duration || isNaN(video.currentTime)) return;
        const now = Date.now();
        if (now - lastWatchSaveTime >= 2000) {
            lastWatchSaveTime = now;
            const relId = getReleaseId();
            const ep = currentEpisode || args?.currentEpisode;
            if (relId && ep) {
                console.log(`[WatchPosition] Saving position: relId=${relId}, ep=${ep.position || ep.name}, time=${video.currentTime.toFixed(1)}s / ${video.duration.toFixed(1)}s`);
                savePosition(relId, ep, video.currentTime, video.duration);
            }
        }
    }

    onDestroy(() => {
        const relId = getReleaseId();
        const ep = currentEpisode || args?.currentEpisode;
        if (video && video.duration && relId && ep) {
            savePosition(relId, ep, video.currentTime, video.duration);
        }
    });

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
                console.log(`[Player] Auto-skipping OP from ${cTime.toFixed(1)}s to ${skipTimes.op.end}s`);
                isOpAutoSkipped = true;
                performSkipOp();
            } else if (!isAutoOp) {
                activeSkipType = 'op';
            }
        } else if (skipTimes.ed && cTime >= skipTimes.ed.start && cTime < skipTimes.ed.end) {
            if (isAutoEd && !isEdAutoSkipped) {
                console.log(`[Player] Auto-skipping ED from ${cTime.toFixed(1)}s to ${skipTimes.ed.end}s`);
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
        if (video && video.currentTime != null) {
            checkAndTriggerSkip(video.currentTime);
        }
    }

    function performSkipOp() {
        if (skipTimes.op && video) {
            console.log(`[Player] Seeking past OP to ${skipTimes.op.end}s`);
            video.currentTime = Number(skipTimes.op.end);
            showSkipToast("Опенинг пропущен");
            activeSkipType = null;
        }
    }

    function performSkipEd() {
        if (skipTimes.ed && video) {
            console.log(`[Player] Seeking past ED to ${skipTimes.ed.end}s`);
            video.currentTime = Number(skipTimes.ed.end);
            showSkipToast("Эндинг пропущен");
            activeSkipType = null;
        }
    }

    playerSettingsStore.subscribe((value) => {
        playerSettings = {
            ...utils.playerDefaultSettings,
            ...(value || {}),
        };
    });

    const playingSettingsRaw = localStorageWritable(
        "playingSettings",
        utils.playingDefaultSettings,
    );

    playingSettingsRaw.subscribe((value) => {
        playingSettings = value;
    });

    const upscaleSettingsRaw = localStorageWritable(
        "upscaleSettings",
        utils.upscaleDefaultSettings,
    );

    upscaleSettingsRaw.subscribe((value) => {
        upscaleSettings = value;
    });

    let upscaleEnabled = upscaleSettings.enabled;

    let sleepTimerType = 'off';
    let sleepTimerValue = 0;
    let sleepEpisodesRemaining = 0;
    let sleepTimerInterval = null;
    let sleepTimerEndTime = null;
    let sleepTimerLabel = "Выкл";

    function clearSleepTimer() {
        if (sleepTimerInterval) {
            clearInterval(sleepTimerInterval);
            sleepTimerInterval = null;
        }
        sleepTimerEndTime = null;
        sleepTimerType = 'off';
        sleepTimerValue = 0;
        sleepEpisodesRemaining = 0;
        sleepTimerLabel = "Выкл";
    }

    async function executeSleepTimerAction() {
        clearSleepTimer();
        const action = playingSettings?.sleepTimerAction ?? "pause";

        switch (action) {
            case "pause":
                if (video) video.pause();
                break;
            case "closePlayer":
                if (video) video.pause();
                updateViewportComponent(8, { id: args.release.id });
                break;
            case "closeApp":
                if (video) video.pause();
                systemPower.quitApp();
                break;
            case "sleep":
                if (video) video.pause();
                systemPower.sleep();
                break;
            case "shutdown":
                if (video) video.pause();
                systemPower.shutdown();
                break;
        }
    }

    function changeSleepTimer(config) {
        clearSleepTimer();
        if (!config || config.type === 'off') {
            sleepTimerLabel = "Выкл";
            return;
        }

        if (config.type === 'episodes') {
            const count = Math.max(1, parseInt(config.count || 1, 10));
            sleepTimerType = 'episodes';
            sleepEpisodesRemaining = count;
            sleepTimerLabel = count === 1 ? "1 серия" : `${count} с.`;
            return;
        }

        if (config.type === 'minutes') {
            const mins = Math.max(1, parseInt(config.minutes || 1, 10));
            sleepTimerType = 'minutes';
            sleepTimerValue = mins;
            sleepTimerLabel = `${mins} мин.`;
            sleepTimerEndTime = Date.now() + mins * 60 * 1000;

            sleepTimerInterval = setInterval(() => {
                if (!sleepTimerEndTime) return;
                const remainingSec = Math.round((sleepTimerEndTime - Date.now()) / 1000);

                if (remainingSec <= 0) {
                    executeSleepTimerAction();
                } else {
                    const m = Math.floor(remainingSec / 60);
                    const s = remainingSec % 60;
                    sleepTimerLabel = `${m}:${s < 10 ? "0" + s : s}`;
                }
            }, 1000);
        }
    }

    async function changeUpscale(enabled) {
        upscaleEnabled = enabled;
        await renderUpscale();
    }

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

    //aspect-16-9
    //aspect-4-3
    //aspect-fit
    let aspectRatio = `aspect-${playerSettings.defaultAspectRatio}`;

    function changeAspectRatio(aspect) {
        playerSettings.defaultAspectRatio = aspect;
        aspectRatio = `aspect-${aspect}`;
    }

    function clampVolume(value) {
        return Math.min(1, Math.max(0, Number(value) || 0));
    }

    function saveVolumePreference(volume) {
        if (!playerSettings?.saveUserVolume?.enabled) return;

        const normalizedVolume = clampVolume(volume);

        persistPlayerSettings({
            ...playerSettings,
            saveUserVolume: {
                ...playerSettings.saveUserVolume,
                lastValue: normalizedVolume,
            },
        });

        settings.set(PLAYER_LAST_VOLUME_KEY, normalizedVolume);
        settings.set(PLAYER_SAVE_VOLUME_ENABLED_KEY, true);
    }

    async function loadPersistedVolume() {
        const [savedVolume, savedSaveVolumeEnabled] =
            await Promise.all([
                settings.get(PLAYER_LAST_VOLUME_KEY),
                settings.get(PLAYER_SAVE_VOLUME_ENABLED_KEY),
            ]);

        persistedVolume =
            typeof savedVolume === "number" ? clampVolume(savedVolume) : null;
        persistedSaveVolumeEnabled =
            typeof savedSaveVolumeEnabled === "boolean"
                ? savedSaveVolumeEnabled
                : null;
    }

    function getPersistedPlayerSettings() {
        try {
            const rawSettings = localStorage.getItem("playerSettings");
            return rawSettings ? JSON.parse(rawSettings) : null;
        } catch (error) {
            return null;
        }
    }

    function getEffectivePlayerSettings() {
        const effectiveSettings = {
            ...utils.playerDefaultSettings,
            ...(getPersistedPlayerSettings() ?? playerSettings ?? {}),
        };

        if (persistedSaveVolumeEnabled !== null) {
            effectiveSettings.saveUserVolume = {
                ...effectiveSettings.saveUserVolume,
                enabled: persistedSaveVolumeEnabled,
            };
        }

        return effectiveSettings;
    }

    function getInitialVolume() {
        const effectivePlayerSettings = getEffectivePlayerSettings();

        if (
            effectivePlayerSettings?.saveUserVolume?.enabled &&
            persistedVolume !== null
        ) {
            return persistedVolume;
        }

        if (effectivePlayerSettings?.saveUserVolume?.enabled) {
            return clampVolume(
                effectivePlayerSettings.saveUserVolume.lastValue ??
                    effectivePlayerSettings.defaultVolume / 100,
            );
        }

        return clampVolume(effectivePlayerSettings?.defaultVolume / 100);
    }

    function syncPersistedVolume() {
        if (!video || video.muted) return;

        saveVolumePreference(video.volume);
    }

    function syncVolumeUI(volume = video?.volume ?? 0) {
        const normalizedVolume = clampVolume(volume);

        volPercent = normalizedVolume * 100;
        if (volControl) {
            volControl.value = normalizedVolume;
        }
    }

    function setVolume(volume, persist = true) {
        if (!video) return;

        const normalizedVolume = clampVolume(volume);
        video.volume = normalizedVolume;
        syncVolumeUI(normalizedVolume);

        if (persist) {
            saveVolumePreference(normalizedVolume);
        }
    }

    let loading = true;
    let forceHideActive = false;

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

    function handleResize(event) {
        isFullscreen = window.innerHeight === screen.height;
    }

    document.addEventListener("mousemove", hideOnIdle);

    window.addEventListener("resize", handleResize);

    onMount(async () => {
        init();
    });

    async function playVideo(episode) {
        if (video && video.duration && args?.release?.id && (currentEpisode || args?.currentEpisode)) {
            savePosition(args.release.id, currentEpisode || args.currentEpisode, video.currentTime, video.duration);
        }
        hasRestoredPosition = false;
        resumeToastMessage = null;
        updateSkipTimes();
        let avaliableQuality, link;
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
                for (const [key, value] of Object.entries(kLinks)) {
                    aQ[key] = {
                        src: value[0].src,
                    };
                }
                avaliableQuality = aQ;
                break;

            case "Liberty":
            case "Libria":
                await utils.fallback(async (success) => {
                    const aLinks = await AniLibriaParser.getDirectLinks(
                        episode.url,
                    );
                    avaliableQuality = aLinks;

                    success = true;
                }, 3);
                break;

            case "Sibnet":
                await utils.fallback(async (success) => {
                    const link = await Sibnet.Parse(episode.url);
                    if (!link) return;

                    avaliableQuality = {
                        "720": {
                            src: link,
                        },
                    };

                    success = true;
                }, 3);
                break;
        }

        const url =
            avaliableQuality[String(playingSettings.defaultQuality)]?.src ??
            avaliableQuality["720"]?.src;

        args.avaliableQuality = avaliableQuality;

        link = `${URL.canParse(url) ? url : `https:${url}`}`;

        if (Hls.isSupported() && !new URL(link).pathname.endsWith(".mp4")) {
            hls.detachMedia();
            hls.destroy();

            hls = new Hls();

            hls.on(Hls.Events.BUFFER_APPENDING, (e, data) => {
                loadedPercent =
                    (data.frag._streams.video.endPTS / video.duration) * 100;
            });

            hls.loadSource(link);
            hls.attachMedia(video);
        } else {
            video.src = link;
        }

        args.src = link;

        await video.play();

        if (!playingSettings.disableHistory) {
            anixApi.release.markEpisodeAsWatched(
                args.release.id,
                args.episodes[0].source.id,
                currentEpisode.position,
            );
            anixApi.release.addToHistory(
                args.release.id,
                args.episodes[0].source.id,
                currentEpisode.position,
            );
        }

        analytics.trackEvent("play_anime", {
            source: source.name,
            name: episode.name,
            releaseTitle: args.release.title_ru,
            dubber: source.type.name,
        });

        startTimestamp = Date.now();

        discordRPC.setActivity({
            type: 3,
            state: `${episode.name}`,
            details: args.release.title_ru.slice(0, 127),
            largeImageKey: "anidesk-transparent",
            largeImageText: "AniDesk - Anixart Client",
            startTimestamp: startTimestamp - video.currentTime * 1000,
            endTimestamp:
                startTimestamp + (video.duration - video.currentTime) * 1000,
            instance: true,
            buttons: [
                {
                    label: "Ссылка на релиз",
                    url: `https://anixart.app/release/${args.release.id}`,
                },
                { label: "Ссылка на клиент", url: "https://anidesk.ds1nc.ru/" },
            ],
        });
    }

    async function renderUpscale() {
        canvas = await waitForElm(".player-canvas");
        await render({
            video,
            canvas,
            pipelineBuilder: (device, inputTexture) => {
                const nativeDimensions = {
                    width: video.videoWidth,
                    height: video.videoHeight,
                };

                const targetDimensions = {
                    width: defaultCanvasSize.width,
                    height: defaultCanvasSize.height,
                };

                return [
                    upscaleEnabled
                        ? new upscaleModeMap[upscaleSettings.mode]({
                              device,
                              inputTexture,
                              nativeDimensions,
                              targetDimensions,
                          })
                        : new Original({
                              device,
                              inputTexture,
                              nativeDimensions,
                              targetDimensions,
                          }),
                ];
            },
        });
    }

    async function changeQuality(quality) {
        const qualitySrc = args.avaliableQuality[String(quality)]?.src;
        if (!qualitySrc) return;

        const url = URL.canParse(qualitySrc)
            ? qualitySrc
            : `https:${qualitySrc}`;

        if (Hls.isSupported()) {
            const currentTime = video.currentTime;
            const isPausedNow = video.paused;

            hls.detachMedia();
            hls.destroy();

            hls = new Hls();

            hls.on(Hls.Events.BUFFER_APPENDING, (e, data) => {
                loadedPercent =
                    (data.frag._streams.video.endPTS / video.duration) * 100;
            });

            hls.loadSource(url);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.currentTime = currentTime;
                if (!isPausedNow) {
                    video.play();
                }
            });
        } else {
            video.src = url;
            video.play();
        }

        if (avaliableGPU) await renderUpscale();

        args.src = url;
        args.currentQuality = quality;
    }

    async function init() {
        mainDiv = await waitForElm(".anidesk-player");
        video = await waitForElm(".player-video");
        await loadPersistedVolume();

        if (Hls.isSupported() && !new URL(args.src).pathname.endsWith(".mp4")) {
            hls = new Hls();

            hls.on(Hls.Events.BUFFER_APPENDING, (e, data) => {
                loadedPercent =
                    (data.frag._streams.video.endPTS / video.duration) * 100;
            });

            hls.loadSource(args.src);
            hls.attachMedia(video);
        } else {
            video.src = args.src;
        }

        video.volume = getInitialVolume();

        volControl = await waitForElm("#volume-position");

        syncVolumeUI(video.volume);

        volControl.oninput = () => {
            setVolume(volControl.value);
        };

        saveVolumePreference(video.volume);

        video.onloadedmetadata = () => {
            loading = true;
            durationTime = utils.returnFormatedTime(video.duration);
            tryRestoreWatchPosition();
        };

        video.onwaiting = () => {
            loading = false;
        };

        video.onplaying = () => {
            loading = false;
            tryRestoreWatchPosition();
        };

        video.onended = () => {
            const relId = getReleaseId();
            const ep = currentEpisode || args?.currentEpisode;
            if (relId && ep && video.duration) {
                savePosition(relId, ep, video.duration, video.duration);
            }
            if (playerSettings.autoplayEpisode) {
                playNextEpisode();
            }
        };

        video.onvolumechange = () => {
            syncVolumeUI(video.volume);
            syncPersistedVolume();
        };

        video.ontimeupdate = () => {
            if (!video || !video.duration) return;
            currentTime = utils.returnFormatedTime(video.currentTime);
            progressPercent = (video.currentTime / video.duration) * 100;

            tryRestoreWatchPosition();
            trySaveWatchPosition();
            checkAndTriggerSkip(video.currentTime);
        };

        updateSkipTimes();

        if (avaliableGPU) await renderUpscale();
        await video.play();

        window.onwheel = (e) => {
            if (e.deltaY > 0) {
                setVolume(video.volume - 0.05);
            } else if (e.deltaY < 0) {
                setVolume(video.volume + 0.05);
            }
        };

        window.onkeydown = (e) => {
            pressedKeys.add(e.code);

            for (const [action, keys] of Object.entries(
                playerSettings.hotkeys,
            )) {
                if (keys.length !== pressedKeys.size) continue;

                if (keys.every((key) => pressedKeys.has(key))) {
                    switch (action) {
                        case "hotkeyPlayPause":
                            isPaused ? video.play() : video.pause();
                            break;

                        case "hotkeyMute":
                            video.muted = !video.muted;
                            break;

                        case "hotkeyFullscreen":
                            isFullscreen
                                ? elecWindow.exitFullscreen()
                                : elecWindow.enterFullscreen();
                            break;

                        case "hotkeyForward":
                            video.currentTime += 10;
                            break;

                        case "hotkeyBackward":
                            video.currentTime -= 10;
                            break;

                        case "hotkeySkipOpening":
                            if (skipTimes.op && video.currentTime >= skipTimes.op.start && video.currentTime < skipTimes.op.end) {
                                performSkipOp();
                            } else if (skipTimes.ed && video.currentTime >= skipTimes.ed.start && video.currentTime < skipTimes.ed.end) {
                                performSkipEd();
                            } else {
                                video.currentTime += 85;
                            }
                            break;

                        case "hotkeyNextEpisode":
                            let e =
                                args.episodes[
                                    args.episodes.findIndex(
                                        (x) =>
                                            x.position ==
                                            currentEpisode.position,
                                    ) + 1
                                ];

                            if (e) {
                                currentEpisode = e;
                                playVideo(currentEpisode);
                            }
                            break;

                        case "hotkeyPrevEpisode":
                            let p =
                                args.episodes[
                                    args.episodes.findIndex(
                                        (x) =>
                                            x.position ==
                                            currentEpisode.position,
                                    ) - 1
                                ];

                            if (p) {
                                currentEpisode = p;
                                playVideo(currentEpisode);
                            }
                            break;
                    }

                    pressedKeys.clear();
                    break;
                }
            }

            switch (e.code) {
                case "Escape":
                    if (isFullscreen) {
                        elecWindow.exitFullscreen();
                    }
                    updateViewportComponent(8, { id: args.release.id });
                    break;
            }
        };

        window.onkeyup = (e) => {
            pressedKeys.delete(e.code);
        };

        // Очищаем массив нажатых клавиш при потере фокуса окна, чтобы небыло проблем
        // когда клавиша осталась в массиве из-за чего хоткеи перестают работать
        window.onblur = () => {
            pressedKeys.clear();
        }

        durationTime = utils.returnFormatedTime(video.duration);
        startTimestamp = Date.now();

        video.onpause = () => {
            isPaused = true;
            loading = false;

            discordRPC.setActivity({
                type: 3,
                state: `${currentEpisode.name}`,
                details: args.release.title_ru.slice(0, 127),
                largeImageKey: "anidesk-transparent",
                largeImageText: "AniDesk - Anixart Client",
                instance: true,
                buttons: [
                    {
                        label: "Ссылка на релиз",
                        url: `https://anixart.app/release/${args.release.id}`,
                    },
                    {
                        label: "Ссылка на клиент",
                        url: "https://anidesk.ds1nc.ru/",
                    },
                ],
            });
        };

        video.onplay = (e) => {
            isPaused = false;
            loading = false;

            startTimestamp = Date.now();

            discordRPC.setActivity({
                type: 3,
                state: `${currentEpisode.name}`,
                details: args.release.title_ru.slice(0, 127),
                largeImageKey: "anidesk-transparent",
                largeImageText: "AniDesk - Anixart Client",
                startTimestamp: startTimestamp - video.currentTime * 1000,
                endTimestamp:
                    startTimestamp +
                    (video.duration - video.currentTime) * 1000,
                instance: true,
                buttons: [
                    {
                        label: "Ссылка на релиз",
                        url: `https://anixart.tv/release/${args.release.id}`,
                    },
                    {
                        label: "Ссылка на клиент",
                        url: "https://anidesk.ds1nc.ru/",
                    },
                ],
            });
        };

        video.onended = async () => {
            if (sleepTimerType === 'episodes') {
                sleepEpisodesRemaining--;
                if (sleepEpisodesRemaining <= 0) {
                    await executeSleepTimerAction();
                    return;
                } else {
                    sleepTimerLabel = sleepEpisodesRemaining === 1 ? "1 серия" : `${sleepEpisodesRemaining} с.`;
                }
            }

            if (playerSettings.autoplayEpisode) {
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
            currentTime = utils.returnFormatedTime(video.currentTime);
            progressPercent = (video.currentTime / video.duration) * 100;
        };

        let source =
            typeof args.currentEpisode.source == "number"
                ? args.episodes.find(
                      (x) => args.currentEpisode.source == x.source["@id"],
                  ).source
                : args.currentEpisode.source;

        rememberPlaybackSelection(source);

        analytics.trackEvent("play_anime", {
            source: source.name,
            name: args.currentEpisode.name,
            releaseTitle: args.release.title_ru,
            dubber: source.type.name,
        });

        discordRPC.setActivity({
            type: 3,
            state: `${currentEpisode.name}`,
            details: args.release.title_ru.slice(0, 127),
            largeImageKey: "anidesk-transparent",
            largeImageText: "AniDesk - Anixart Client",
            startTimestamp: startTimestamp - video.currentTime * 1000,
            endTimestamp:
                startTimestamp + (video.duration - video.currentTime) * 1000,
            instance: true,
            buttons: [
                {
                    label: "Ссылка на релиз",
                    url: `https://anixart.tv/release/${args.release.id}`,
                },
                { label: "Ссылка на клиент", url: "https://anidesk.ds1nc.ru/" },
            ],
        });
    }

    onDestroy(() => {
        clearSleepTimer();
        //Destroy all event listeners
        if (hls) {
            hls.detachMedia();
            hls.destroy();
        }
        document.removeEventListener("mousemove", hideOnIdle);
        window.removeEventListener("resize", handleResize);
        window.onwheel = null;
        window.onkeydown = null;
        window.onkeyup = null;
        window.onblur = null;
        video.onpause = null;
        video.onplay = null;
        video.ontimeupdate = null;
        video.onloadedmetadata = null;
        video.onwaiting = null;
        video.onplaying = null;
        video.onvolumechange = null;

        if (video && !video.muted) {
            syncPersistedVolume();
        }
        video = null;

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
        {isFullscreen}
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
        hasSkipTimes={!!(skipTimes?.op || skipTimes?.ed)}
        {skipToastMessage}
        {resumeToastMessage}
        {performRestartVideo}
        {performSkipOp}
        {performSkipEd}
    />

    <span class:hide={!loading} class="loader"></span>

    {#if avaliableGPU}
        <canvas
            class="player-canvas {aspectRatio}"
            width={screen.width}
            height={screen.height}
        ></canvas>
    {/if}
    <video
        class="player-video"
        crossorigin="anonymous"
        class:full={!avaliableGPU}
        class:hide={avaliableGPU}
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
