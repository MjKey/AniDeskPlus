<script>
    import Preloader from "../gui/Preloader.svelte";
    import { createEventDispatcher, onMount } from "svelte";
    import { AniLibriaParser, KodikParser } from "anixartjs";
    import { localStorageWritable } from "@babichjacob/svelte-localstorage";
    import DropdownButton from "../buttons/DropdownButton.svelte";
    import { getReleasePositions } from "../../utils/watchPosition.js";
    import { downloadProgressStore } from "../stores/downloadProgressStore";
    import { Pages } from "../../pages.js";

    const dispatch = createEventDispatcher();

    export let args;
    export let showed;

    $: progresses = $downloadProgressStore;
    let offlineLibrary = [];

    let currentDubberId,
        currentDubberName,
        currentSourceId,
        currentSourceName,
        playingSettings,
        episodes;

    let preferredDubbersMap = {};

    onMount(async () => {
        try {
            preferredDubbersMap = JSON.parse(localStorage.getItem("preferred_dubbers") || "{}");
        } catch (e) {
            preferredDubbersMap = {};
        }
        try {
            if (typeof window !== 'undefined' && window.offlineApi) {
                offlineLibrary = await window.offlineApi.getLibrary();
            }
        } catch (e) {
            console.error("Failed to load offline library", e);
        }
    });

    $: releaseDubber = (args?.id && preferredDubbersMap[args.id]) || "";
    $: isPreferredDubber = Boolean(
        releaseDubber &&
        currentDubberName &&
        releaseDubber.toLowerCase().trim() === currentDubberName.toLowerCase().trim()
    );

    function togglePreferredDubber() {
        if (!currentDubberName || !args?.id) return;
        try {
            preferredDubbersMap = JSON.parse(localStorage.getItem("preferred_dubbers") || "{}");
        } catch (e) {
            preferredDubbersMap = {};
        }

        if (isPreferredDubber) {
            delete preferredDubbersMap[args.id];
        } else {
            preferredDubbersMap[args.id] = currentDubberName;
        }

        localStorage.setItem("preferred_dubbers", JSON.stringify(preferredDubbersMap));
        preferredDubbersMap = { ...preferredDubbersMap };
    }

    $: watchMap = getReleasePositions(args?.id);

    let dubberList = [];
    let dubbers = [];
    let backgroundModal = document.querySelector(".modal-background");

    anixApi.release.getDubbers(args.id).then((v) => {
        dubbers = v.types;
        const preferredDubberId = getPreferredDubberId(v.types);
        if (preferredDubberId !== null) {
            selectDubber(preferredDubberId);
        }
        dubberList = v.types.map((x) => ({
            label: x.name,
            value: x.id,
            icon:
                x.icon == "" || !x.icon
                    ? "./assets/icons/defaultDubber.svg"
                    : x.icon,
            description: `${x.view_count} просмотров | ${x.episodes_count} эпизодов`,
        }));
    });

    let sourceList = {
        sources: [],
    };

    const playingSettingsRaw = localStorageWritable(
        "playingSettings",
        utils.playingDefaultSettings,
    );

    playingSettingsRaw.subscribe((value) => {
        playingSettings = value;
    });

    $: favoriteSourceName =
        utils.sourceValues.find((x) => x.value === playingSettings?.defaultSource)
            ?.label ?? null;

    function updatePlayingSettings(patch) {
        playingSettings = {
            ...playingSettings,
            ...patch,
        };
        playingSettingsRaw.set(playingSettings);
    }

    function getPreferredDubberId(types) {
        if (!types.length) return null;
        if (!playingSettings?.rememberSelection) return types[0].id;

        const rememberedDubber =
            types.find((x) => x.id == playingSettings?.lastDubberId) ??
            types.find((x) => x.name == playingSettings?.lastDubberName);

        return rememberedDubber?.id ?? types[0].id;
    }

    function getPreferredSource(sources) {
        if (!sources.length) return null;

        if (playingSettings?.rememberSelection) {
            const rememberedSource =
                sources.find((x) => x.id == playingSettings?.lastSourceId) ??
                sources.find((x) => x.name == playingSettings?.lastSourceName);

            if (rememberedSource) {
                return rememberedSource;
            }
        }

        const matchedDefaultSource = sources.find(
            (x) => x.name == favoriteSourceName,
        );

        return matchedDefaultSource ?? sources[0];
    }

    async function selectDubber(id) {
        currentDubberId = id;
        currentDubberName = dubbers.find((x) => x.id == id)?.name ?? null;

        episodes = null;

        sourceList = await anixApi.release.getDubberSources(
            args.id,
            currentDubberId,
        );

        const preferredSource = getPreferredSource(sourceList.sources);

        currentSourceId = preferredSource?.id ?? null;
        currentSourceName = preferredSource?.name ?? null;

        episodes = getEpisodes();

        return sourceList;
    }

    function selectSource(src) {
        currentSourceId = src;
        currentSourceName = sourceList.sources.find((x) => x.id == src).name;
    }

    function setTitle(title) {
        dispatch("setTitle", title);
    }

    async function getEpisodes() {
        if (!currentDubberId || !currentSourceId) {
            return { episodes: [] };
        }

        const res = await anixApi.release.getEpisodes(
            args.id,
            currentDubberId,
            currentSourceId,
        );

        if (res?.episodes) {
            utils.sortEpisodes(res.episodes);
        }

        return res;
    }

    let downloadingEpisodeId = null;

    async function downloadEpisode(ep, evt) {
        if (evt) evt.stopPropagation();
        if (downloadingEpisodeId) return;

        downloadingEpisodeId = ep.id;

        try {
            let availableQuality = {};
            let referer = null;

            switch (currentSourceName) {
                case "Kodik":
                    const kLinks = await KodikParser.getDirectLinks(ep.url);
                    for (const [key, value] of Object.entries(kLinks || {})) {
                        availableQuality[key] = { src: value[0].src };
                    }
                    referer = "https://kodik.info/";
                    break;

                case "Liberty":
                case "Libria":
                    availableQuality = (await AniLibriaParser.getDirectLinks(ep.url)) || {};
                    break;

                case "Sibnet":
                    await utils.fallback(async () => {
                        const link = await Sibnet.Parse(ep.url);
                        if (link) {
                            availableQuality = { "720": { src: link } };
                            return true;
                        }
                        return false;
                    }, 3);
                    referer = "https://video.sibnet.ru/";
                    break;
            }

            const rawUrl =
                availableQuality["1080"]?.src ||
                availableQuality["720"]?.src ||
                availableQuality["480"]?.src ||
                availableQuality["360"]?.src ||
                Object.values(availableQuality)[0]?.src;

            if (!rawUrl) {
                if (window.notify?.send) {
                    notify.send({ title: "Ошибка скачивания", message: "Не удалось получить прямую ссылку на видео." });
                }
                return;
            }

            const url = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
            const releaseTitle = args?.title_ru || args?.title_original || "Аниме";
            const defaultFileName = `${releaseTitle} - ${ep.name}${currentDubberName ? ` (${currentDubberName})` : ""}.mp4`;

            if (window.episodeDownloader?.download) {
                const res = await window.episodeDownloader.download(url, defaultFileName, referer);
                if (res?.success) {
                    if (window.notify?.send) {
                        notify.send({ title: "Скачивание завершено", message: `Серия ${ep.name} успешно сохранена!` });
                    }
                } else if (res?.error) {
                    if (window.notify?.send) {
                        notify.send({ title: "Ошибка скачивания", message: res.error });
                    }
                }
            }
        } catch (e) {
            console.error("Failed to download episode:", e);
        } finally {
            downloadingEpisodeId = null;
        }
    }
</script>

{#snippet baseCard(x, clickCallback)}
    {@const epPos = x.position || x.id}
    {@const pos = watchMap.get(epPos || 1)}
    {@const progress = progresses[`${args.id}_${epPos}`]}
    {@const offlineEp = (offlineLibrary.find(a => a.id === args.id)?.episodes || []).find(e => e.id === epPos)}
    {@const isOffline = Boolean(offlineEp || progress === 100)}
    <div class="base-card" role="button" tabindex="0" onclick={clickCallback}>
        <div class="base-card-name">
            {x.name}
        </div>
        <div class="right-menu flex-row">
            <button
                class="episode-download-btn flex-row"
                title={isOffline ? "Удалить скачанный эпизод" : (progress >= 0 && progress < 100 ? "Отменить скачивание" : "Скачать серию")}
                onclick={async (evt) => {
                    evt.stopPropagation();
                    if (isOffline) {
                        if (confirm("Вы действительно хотите удалить эту скачанную серию?")) {
                            await window.offlineApi.deleteEpisode(args.id, epPos);
                            downloadProgressStore.update(s => { delete s[`${args.id}_${epPos}`]; return { ...s }; });
                            if (window.offlineApi) offlineLibrary = await window.offlineApi.getLibrary();
                        }
                        return;
                    }
                    if (progress === -2 || (progress >= 0 && progress < 100)) {
                        await window.offlineApi.cancelDownload(args.id, epPos);
                        downloadProgressStore.update(s => { delete s[`${args.id}_${epPos}`]; return { ...s }; });
                        return;
                    }
                    try {
                        let availableQuality = {};
                        const sourceName = x.source?.name || x.source?.type?.name || currentSourceName || "Kodik";
                        switch (sourceName) {
                            case "Kodik":
                                const kLinks = await KodikParser.getDirectLinks(x.url);
                                for (const [key, value] of Object.entries(kLinks || {})) {
                                    const cleanKey = String(key).replace(/p$/i, '');
                                    const srcUrl = Array.isArray(value) ? value[0]?.src : value?.src;
                                    if (srcUrl) availableQuality[cleanKey] = { src: srcUrl };
                                }
                                break;
                            case "Liberty":
                            case "Libria":
                                availableQuality = (await AniLibriaParser.getDirectLinks(x.url)) || {};
                                break;
                            case "Sibnet":
                                await utils.fallback(async () => {
                                    const link = await (SibnetParser.getDirectLinks ? SibnetParser.getDirectLinks(x.url) : SibnetParser.getDirectLink(x.url));
                                    if (!link) return false;
                                    const srcUrl = typeof link === 'string' ? link : (link["720"]?.src || link["720"]?.[0]?.src || link.src || link);
                                    availableQuality = { "720": { src: srcUrl } };
                                    return true;
                                }, 3);
                                break;
                        }
                        const rawUrl = availableQuality["1080"]?.src || availableQuality["720"]?.src || availableQuality["480"]?.src || availableQuality["360"]?.src || Object.values(availableQuality)[0]?.src;
                        if (!rawUrl) return;
                        const realUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
                        await window.offlineApi.downloadEpisode(
                            {
                                id: args.id,
                                title: args.title_ru || args.title || args.name || "Аниме",
                                title_ru: args.title_ru || args.title || args.name || "Аниме",
                                image: args.image,
                                grade: args.grade ?? null,
                                status: args.status ?? null,
                                profile_list_status: args.profile_list_status ?? 0
                            },
                            { id: epPos, title: x.name },
                            realUrl
                        );
                        downloadProgressStore.update(s => ({ ...s, [`${args.id}_${epPos}`]: 0 }));
                    } catch (e) {
                        console.error("Download episode error:", e);
                    }
                }}
            >
                {#if isOffline}
                    <span style="color: #4CAF50; font-size: 13px; font-weight: bold; margin-right: 4px;">Скачано</span>
                    <img src="./assets/icons/checkmark.svg" alt="check" width="16" height="16" />
                {:else if progress >= 0 && progress < 100}
                    <span style="color: #4CAF50; font-size: 13px; font-weight: bold;">{Math.round(progress)}%</span>
                {:else if progress === -2}
                    <span style="color: #FFC107; font-size: 13px; font-weight: bold;">Очередь</span>
                {:else if progress === -1}
                    <span style="color: #F44336; font-size: 13px; font-weight: bold;">Ошибка</span>
                {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                {/if}
            </button>
            {#if x.is_watched || pos?.completed}
                <img src="./assets/icons/checkmark.svg" alt="check" />
            {/if}
        </div>
        {#if pos && pos.percentage > 0 && !pos.completed}
            <div class="episode-progress-bar" style="width: {pos.percentage}%"></div>
        {/if}
    </div>
{/snippet}

<div class="modal-title">
    <span class="title">Выбор эпизода</span>
    <div class="modal-buttons flex-row">
        <div class="dubber-select-container flex-row">
            <DropdownButton
                placeholder="Озвучка"
                bind:values={dubberList}
                value={currentDubberId}
                onChange={(e, v) => {
                    selectDubber(v);
                }}
                height={35}
                width={250}
                outsideElement={backgroundModal}
            />
            {#if currentDubberName}
                <button
                    class="dubber-bell-btn flex-row"
                    class:active={isPreferredDubber}
                    onclick={togglePreferredDubber}
                    title={isPreferredDubber
                        ? `Уведомления отправляются для озвучки "${currentDubberName}"`
                        : `Получать уведомления для озвучки "${currentDubberName}"`}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill={isPreferredDubber ? "#f1c40f" : "none"}
                        stroke={isPreferredDubber ? "#f1c40f" : "currentColor"}
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                </button>
            {/if}
        </div>
        <DropdownButton
            placeholder="Источник"
            values={sourceList.sources.map((x) => ({
                label: x.name,
                value: x.id,
                description: `${x.episodes_count} эпизодов`,
            }))}
            value={currentSourceId}
            onChange={(e, v) => {
                selectSource(v);
                episodes = getEpisodes();
            }}
            height={35}
            width={140}
            outsideElement={backgroundModal}
        />
    </div>
</div>
<div class="modal-content">
    {#key currentSourceId}
        {#if episodes}
            {#await episodes}
                <div class="center">
                    <Preloader />
                </div>
            {:then i}
                {#each i.episodes as d}
                    {@render baseCard(d, async () => {
                        const epPos = d.position || d.id;
                        const offlineEp = (offlineLibrary.find(a => a.id === args.id)?.episodes || []).find(e => e.id === epPos);
                        if (offlineEp) {
                            const libAnime = offlineLibrary.find(a => a.id === args.id);
                            const downloadedEps = libAnime?.episodes || [];
                            const episodesMock = i.episodes.map(epItem => {
                                const posId = epItem.position || epItem.id;
                                const matchOff = downloadedEps.find(e => e.id === posId);
                                if (matchOff) {
                                    const epHex = Array.from(new TextEncoder().encode(matchOff.filePath)).map(b => b.toString(16).padStart(2, '0')).join('');
                                    return {
                                        ...epItem,
                                        url: `anixflow://${epHex}`,
                                        isOffline: true
                                    };
                                }
                                return epItem;
                            });
                            const hexPath = Array.from(new TextEncoder().encode(offlineEp.filePath)).map(b => b.toString(16).padStart(2, '0')).join('');
                            const offlineUrl = `anixflow://${hexPath}`;
                            updateViewportComponent(Pages.PLAYER, {
                                src: offlineUrl,
                                currentQuality: 720,
                                availableQuality: { "720": { src: offlineUrl } },
                                release: args,
                                episodes: episodesMock,
                                currentEpisode: { ...d, url: offlineUrl },
                                isOffline: true
                            });
                            return;
                        }

                        let availableQuality, link;

                        const sourceName = d.source?.name || d.source?.type?.name || currentSourceName || "Kodik";
                        switch (sourceName) {
                            case "Kodik":
                                let aQ = {};
                                const kLinks = await KodikParser.getDirectLinks(
                                    d.url,
                                );
                                for (const [key, value] of Object.entries(
                                    kLinks || {},
                                )) {
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
                                const aLinks =
                                    await AniLibriaParser.getDirectLinks(d.url);
                                availableQuality = aLinks;
                                break;

                            case "Sibnet":
                                await utils.fallback(async () => {
                                    const link = await (SibnetParser.getDirectLinks ? SibnetParser.getDirectLinks(d.url) : SibnetParser.getDirectLink(d.url));
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

                        if (!playingSettings.disableHistory) {
                            anixApi.release.markEpisodeAsWatched(
                                args.id,
                                currentSourceId ?? i.episodes[0].source.id,
                                d.position,
                            );
                            anixApi.release.addToHistory(
                                args.id,
                                currentSourceId ?? i.episodes[0].source.id,
                                d.position,
                            );
                        }

                        const url =
                            availableQuality?.[String(playingSettings.defaultQuality)]?.src ??
                            availableQuality?.["1080"]?.src ??
                            availableQuality?.["720"]?.src ??
                            availableQuality?.["480"]?.src ??
                            availableQuality?.["360"]?.src ??
                            Object.values(availableQuality || {})[0]?.src;

                        if (playingSettings?.rememberSelection) {
                            updatePlayingSettings({
                                lastDubberId: currentDubberId ?? null,
                                lastDubberName: currentDubberName ?? null,
                                lastSourceId: currentSourceId ?? null,
                                lastSourceName: currentSourceName ?? null,
                            });
                        }

                        const finalSrc = url ? (url.startsWith('//') ? `https:${url}` : url) : "";

                        updateViewportComponent(11, {
                            src: finalSrc,
                            currentQuality: playingSettings.defaultQuality || 720,
                            availableQuality: availableQuality || {},
                            release: args,
                            episodes: i.episodes,
                            currentEpisode: d,
                        });
                    })}
                {/each}
            {/await}
        {:else}
            <div class="center">
                <Preloader />
            </div>
        {/if}
    {/key}
</div>

<style>
    .center {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
    }

    .modal-buttons {
        width: fit-content;
        margin-right: 25px;
        gap: 10px;
        align-items: center;
    }

    .dubber-select-container {
        align-items: center;
        gap: 6px;
    }

    .dubber-bell-btn {
        background-color: var(--alt-gray-background-color);
        color: var(--secondary-text-color);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        width: 35px;
        height: 35px;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .dubber-bell-btn:hover {
        background-color: var(--select-button-color);
        color: var(--main-text-color);
    }

    .dubber-bell-btn.active {
        background-color: rgba(241, 196, 15, 0.15);
        border-color: rgba(241, 196, 15, 0.5);
        color: #f1c40f;
    }

    .modal-title {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
    }

    .base-card {
        display: flex;
        flex-direction: row;
        align-items: center;
        cursor: pointer;
        height: 40px;
        min-height: 40px;
        border-radius: 7px;
        position: relative;
        overflow: hidden;
    }

    .episode-progress-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background-color: var(--select-button-left-color);
        border-radius: 0 2px 2px 0;
        pointer-events: none;
    }

    .base-card:hover {
        background-color: var(--select-button-color);
    }

    .base-card-name {
        margin-left: 10px;
        font-size: 18px;
        font-weight: bold;
        color: var(--main-text-color);
        display: flex;
        flex-direction: column;
    }

    .right-menu {
        margin-left: auto;
        margin-right: 0;
        align-items: center;
        gap: 6px;
    }

    .episode-download-btn {
        background: transparent;
        border: none;
        color: var(--secondary-text-color);
        padding: 4px 6px;
        border-radius: 6px;
        cursor: pointer;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        line-height: 1;
    }

    .episode-download-btn:hover {
        background-color: var(--alt-gray-background-color, rgba(255, 255, 255, 0.15));
        color: var(--main-text-color);
        transform: scale(1.1);
    }

    .episode-download-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .download-spinner {
        font-size: 14px;
        animation: spin 1s infinite linear;
    }
</style>
