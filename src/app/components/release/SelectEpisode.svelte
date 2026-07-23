<script>
    import Preloader from "../gui/Preloader.svelte";
    import { createEventDispatcher, onMount } from "svelte";
    import { AniLibriaParser, KodikParser } from "anixartjs";
    import { localStorageWritable } from "@babichjacob/svelte-localstorage";
    import DropdownButton from "../buttons/DropdownButton.svelte";
    import { getReleasePositions } from "../../utils/watchPosition.js";

    const dispatch = createEventDispatcher();

    export let args;
    export let showed;

    let currentDubberId,
        currentDubberName,
        currentSourceId,
        currentSourceName,
        playingSettings,
        episodes;

    let preferredDubbersMap = {};

    onMount(() => {
        try {
            preferredDubbersMap = JSON.parse(localStorage.getItem("preferred_dubbers") || "{}");
        } catch (e) {
            preferredDubbersMap = {};
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
</script>

{#snippet baseCard(x, clickCallback)}
    {@const pos = watchMap.get(x.position || parseInt(x.name?.match(/\d+/)?.[0] || '1', 10) || 1)}
    <button class="base-card" onclick={clickCallback}>
        <div class="base-card-name">
            {x.name}
        </div>
        <div class="right-menu flex-row">
            {#if x.is_watched || pos?.completed}
                <img src="./assets/icons/checkmark.svg" alt="check" />
            {/if}
        </div>
        {#if pos && pos.percentage > 0 && !pos.completed}
            <div class="episode-progress-bar" style="width: {pos.percentage}%"></div>
        {/if}
    </button>
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
                        let avaliableQuality, link;

                        switch (currentSourceName) {
                            case "Kodik":
                                let aQ = {};
                                const kLinks = await KodikParser.getDirectLinks(
                                    d.url,
                                );
                                for (const [key, value] of Object.entries(
                                    kLinks,
                                )) {
                                    aQ[key] = {
                                        src: value[0].src,
                                    };
                                }
                                avaliableQuality = aQ;
                                break;

                            case "Liberty":
                            case "Libria":
                                const aLinks =
                                    await AniLibriaParser.getDirectLinks(d.url);
                                avaliableQuality = aLinks;
                                break;

                            case "Sibnet":
                                await utils.fallback(async (success) => {
                                    const link = await Sibnet.Parse(d.url);
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
                            avaliableQuality[
                                String(playingSettings.defaultQuality)
                            ]?.src ?? avaliableQuality["720"]?.src;

                        if (playingSettings?.rememberSelection) {
                            updatePlayingSettings({
                                lastDubberId: currentDubberId ?? null,
                                lastDubberName: currentDubberName ?? null,
                                lastSourceId: currentSourceId ?? null,
                                lastSourceName: currentSourceName ?? null,
                            });
                        }

                        updateViewportComponent(11, {
                            src: `${URL.canParse(url) ? url : `https:${url}`}`,
                            currentQuality: 720,
                            avaliableQuality,
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
        justify-items: center;
    }
</style>
