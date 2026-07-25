<script>
    import { onDestroy, onMount } from "svelte";
    import PlayerDropdown from "./PlayerDropdown.svelte";
    import PlayerSettings from "./PlayerSettings.svelte";
    import PlayerHeader from "./PlayerHeader.svelte";
    import PlayerTimeline from "./PlayerTimeline.svelte";
    import PlayerControls from "./PlayerControls.svelte";
    import PlayerSkipControls from "./PlayerSkipControls.svelte";
    import PlayerToasts from "./PlayerToasts.svelte";
    import utils from "../../utils";

    export let args;
    export let video;
    export let isFullscreen;
    export let isHidden;
    export let forceHide;
    export let isPaused;
    export let currentTime;
    export let durationTime;
    export let progressPercent;
    export let loadedPercent;
    export let isScrubbing = false;
    export let playVideo;
    export let cEpisode = args.currentEpisode;
    export let dropdownShowed = false;
    export let transparentPercent = 50;
    export let changeQuality;
    export let changeUpscale;
    export let upscaleEnabled;
    export let changeAspectRatio;
    export let aspectRatio;
    export let changeSleepTimer;
    export let sleepTimerLabel = "Выкл";
    export let activeSkipType = null;
    export let skipTimes = { op: null, ed: null };
    export let hasSkipTimes = false;
    export let skipToastMessage = null;
    export let resumeToastMessage = null;
    export let performRestartVideo = null;
    export let performSkipOp = null;
    export let performSkipEd = null;
    export let volumePercent = 50;

    let showSettings = false;
    let dropdownElements, dropdownType;

    function onClickGui() {
        if (showSettings) showSettings = false;
        if (dropdownShowed) dropdownShowed = false;
    }

    async function onElementClick(e) {
        const argsElement = e.detail;

        switch (argsElement.type) {
            case "episodes":
                if (argsElement.history.find((x) => x.type == "related")) {
                    let rr = argsElement.history.find(
                        (x) => x.type == "related",
                    ).selectedValue;

                    rr.related = args.release.related;
                    rr.related_count = args.release.related_count;
                    args.release = rr;
                }
                if (argsElement.history.find((x) => x.type == "dubbers"))
                    args.episodes = argsElement.elements.map((x) => x.value);

                cEpisode = argsElement.value;
                playVideo(argsElement.value);
                argsElement.close();
                break;

            case "dubbers":
                const r = argsElement.history.find(
                    (x) => x.type == "related",
                )?.selectedValue;

                const s = await anixApi.release.getDubberSources(
                    r ? r.id : args.release.id,
                    argsElement.value.id,
                );

                let elements = [];
                let value = argsElement.value;
                let type = "sources";

                if (s.sources.length == 1) {
                    const ep = await anixApi.release.getEpisodes(
                        r ? r.id : args.release.id,
                        argsElement.value.id,
                        s.sources[0].id,
                    );
                    if (ep?.episodes) utils.sortEpisodes(ep.episodes);

                    type = "episodes";
                    value = s.sources[0];

                    elements = ep.episodes.map((x) => ({
                        title: x.name,
                        subtitle: `${argsElement.value.name} | ${ep.episodes[0].source.name}`,
                        value: x,
                    }));
                } else {
                    elements = s.sources.map((x) => ({
                        title: x.name,
                        subtitle: `${x.episodes_count} Эпизодов`,
                        image: {
                            type: "default",
                            src: x.icon ?? "./assets/icons/defaultDubber.svg",
                        },
                        value: x,
                    }));
                }

                argsElement.nextPage(argsElement.value, elements, type);
                break;

            case "sources":
                const related = argsElement.history.find(
                    (x) => x.type == "related",
                )?.selectedValue;

                const dubber = argsElement.history.find(
                    (x) => x.type == "dubbers",
                ).selectedValue;

                const ep = await anixApi.release.getEpisodes(
                    related ? related.id : args.release.id,
                    dubber.id,
                    argsElement.value.id,
                );
                if (ep?.episodes) utils.sortEpisodes(ep.episodes);
                argsElement.nextPage(
                    argsElement.value,
                    ep.episodes.map((x) => ({
                        title: x.name,
                        subtitle: `${dubber.name} | ${ep.episodes[0].source.name}`,
                        value: x,
                    })),
                    "episodes",
                );
                break;

            case "related":
                const dubbers = await anixApi.release.getDubbers(
                    argsElement.value.id,
                );
                argsElement.nextPage(
                    argsElement.value,
                    dubbers.types.map((z) => ({
                        title: z.name,
                        subtitle: `${z.episodes_count} Эпизодов`,
                        image: {
                            type: "default",
                            src: z.icon ?? "./assets/icons/defaultDubber.svg",
                        },
                        value: z,
                    })),
                    "dubbers",
                );
                break;
        }
    }

    function showEpisodesDropdown(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        const firstEp = args?.episodes?.[0];
        const dubberName = firstEp?.source?.type?.name ?? firstEp?.source?.name ?? "Серии";
        const sourceName = firstEp?.source?.name ?? "";
        const subtitle = dubberName && sourceName && dubberName !== sourceName ? `${dubberName} | ${sourceName}` : dubberName;

        dropdownElements = (args?.episodes || []).map((x) => ({
            title: x.name,
            subtitle,
            value: x,
        }));
        dropdownType = "episodes";
        dropdownShowed = true;
    }

    async function showDubbersDropdown(e) {
        e.stopPropagation();
        const dubbers = await anixApi.release.getDubbers(args.release.id);
        dropdownElements = dubbers.types.map((z) => ({
            title: z.name,
            subtitle: `${z.episodes_count} Эпизодов`,
            image: {
                type: "default",
                src: z.icon ?? "./assets/icons/defaultDubber.svg",
            },
            value: z,
        }));
        dropdownType = "dubbers";
        dropdownShowed = true;
    }

    async function showRelatedReleasesDropdown() {
        const related = await anixApi.release.getRelatedReleases(
            args.release.related.id,
            0,
        );
        dropdownElements = related.content.map((b) => ({
            title: b.title_ru,
            subtitle: b.title_original,
            description: b.description,
            image: {
                type: "poster",
                src: b.image,
            },
            value: b,
        }));
        dropdownType = "related";
        dropdownShowed = true;
    }
</script>

<div
    class="player-gui"
    class:hide-gui={isHidden && !isPaused}
    style="--back-transparent: {transparentPercent / 100}"
    onclick={onClickGui}
    role="region"
    aria-label="Player GUI"
>
    <!-- Header Component -->
    <PlayerHeader
        titleRu={args?.release?.title_ru}
        episodeName={cEpisode?.name}
        dubberName={args?.episodes?.[0]?.source?.type?.name}
    />

    <!-- Dropdowns (Left & Settings) -->
    <div class="gui-dropdown-left flew-column">
        <PlayerDropdown
            elements={dropdownElements}
            bind:isShow={dropdownShowed}
            bind:type={dropdownType}
            on:elementClick={onElementClick}
        />
    </div>
    <div class="gui-settings-dropdown flew-column">
        <PlayerSettings
            bind:isShow={showSettings}
            currentSettings={{
                currentQuality: args.currentQuality,
                availableQuality: args.availableQuality,
                upscaleEnabled,
                aspectRatio,
                sleepTimerLabel,
            }}
            {changeQuality}
            {changeUpscale}
            {changeAspectRatio}
            {changeSleepTimer}
            {video}
        />
    </div>

    <!-- Bottom Bar Container -->
    <div class="gui-bottom-bar flex-column">
        <!-- Timeline Component -->
        <PlayerTimeline
            {video}
            {progressPercent}
            {loadedPercent}
            bind:isScrubbing
            {skipTimes}
            on:scrub={(e) => {
                currentTime = e.detail.formattedTime;
                progressPercent = e.detail.percent;
            }}
        />

        <!-- Controls Component -->
        <PlayerControls
            {video}
            {isPaused}
            {currentTime}
            {durationTime}
            bind:volumePercent
            bind:isFullscreen
            bind:showSettings
            bind:cEpisode
            episodes={args.episodes}
            release={args.release}
            {playVideo}
            on:forceHide={forceHide}
            on:showEpisodesDropdown={showEpisodesDropdown}
            on:showDubbersDropdown={showDubbersDropdown}
            on:showRelatedDropdown={showRelatedReleasesDropdown}
        >
            <svelte:fragment slot="skip-controls">
                <PlayerSkipControls
                    {activeSkipType}
                    releaseId={args?.release?.id}
                    {video}
                    {performSkipOp}
                    {performSkipEd}
                    on:skipPerformed={(e) => {
                        if (video) {
                            progressPercent = (video.currentTime / video.duration) * 100;
                            currentTime = utils.returnFormatedTime(video.currentTime);
                        }
                    }}
                />
            </svelte:fragment>
        </PlayerControls>
    </div>

    <!-- Toasts Component -->
    <PlayerToasts
        {skipToastMessage}
        {resumeToastMessage}
        {performRestartVideo}
    />
</div>

<style>
    .player-gui {
        width: 100%;
        height: 100%;
        position: absolute;
        z-index: 2;
        background-color: rgba(0, 0, 0, var(--back-transparent));
        transition: opacity 0.5s;
        opacity: 1;
    }

    .gui-dropdown-left {
        position: absolute;
        bottom: 140px;
        z-index: 3;
    }

    .gui-settings-dropdown {
        position: absolute;
        bottom: 140px;
        right: 10px;
        z-index: 3;
    }

    .hide-gui {
        animation: hide-gui 0.25s forwards;
    }

    @keyframes hide-gui {
        100% {
            opacity: 0;
            display: none;
        }
    }

    .gui-bottom-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        z-index: 3;
        justify-content: space-between;
        color: var(--main-text-color);
        font-size: 12px;
        align-items: center;
        vertical-align: middle;
    }
</style>
