<script>
    import { onDestroy, onMount } from "svelte";
    import PlayerDropdown from "./PlayerDropdown.svelte";
    import PlayerSettings from "./PlayerSettings.svelte";

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

    let showTimelineMouse = false;
    let showSettings = false;
    let mousePosPercent = 0;
    let dropdownElements, dropdownType;
    let relatedMaxPage = 0;
    export let volumePercent = 50;

    import utils from "../../utils";

    let skipTime = 85;
    let showSkipSlider = false;
    let skipLongPressTimeout;
    let skipButtonPressed = false;

    $: if (args && args.release) {
        const stored = localStorage.getItem("skipDurations");
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                skipTime = parsed[args.release.id] || 85;
            } catch (e) {
                skipTime = 85;
            }
        } else {
            skipTime = 85;
        }
    }

    function saveSkipTime(value) {
        const stored = localStorage.getItem("skipDurations");
        let parsed = {};
        if (stored) {
            try {
                parsed = JSON.parse(stored);
            } catch (e) {}
        }
        parsed[args.release.id] = value;
        localStorage.setItem("skipDurations", JSON.stringify(parsed));
    }

    function handleSkipMouseDown() {
        skipButtonPressed = true;
        skipLongPressTimeout = setTimeout(() => {
            if (skipButtonPressed) {
                showSkipSlider = true;
                skipButtonPressed = false;
            }
        }, 600);
    }

    function handleSkipMouseUp() {
        if (skipButtonPressed) {
            clearTimeout(skipLongPressTimeout);
            skipButtonPressed = false;
            performSkip();
        }
    }

    function handleSkipMouseLeave() {
        if (skipButtonPressed) {
            clearTimeout(skipLongPressTimeout);
            skipButtonPressed = false;
        }
    }

    function performSkip() {
        video.currentTime = video.currentTime + skipTime;
        progressPercent = (video.currentTime / video.duration) * 100;
        currentTime = utils.returnFormatedTime(video.currentTime);
    }

    onDestroy(() => {
        if (skipLongPressTimeout) clearTimeout(skipLongPressTimeout);
    });

    function onClickGui() {
        if (showSettings) {
            showSettings = false;
        }

        if (dropdownShowed) {
            dropdownShowed = false;
        }
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
        e.stopPropagation();
        dropdownElements = args.episodes.map((x) => ({
            title: x.name,
            subtitle: `${args.episodes[0].source.type.name} | ${args.episodes[0].source.name}`,
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
        relatedMaxPage = related.total_pages;
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

    function playerMouseMove(e) {
        if (isScrubbing) {
            const timelineContainer = document.querySelector(".gui-timeline");
            const rect = timelineContainer.getBoundingClientRect();

            const percent =
                (Math.min(Math.max(0, e.x - rect.x), rect.width) / rect.width) *
                100;

            video.currentTime = (video.duration / 100) * percent;
            currentTime = utils.returnFormatedTime(video.currentTime);
            progressPercent = percent;
        }
    }

    function playerMouseUp(e) {
        if (isScrubbing) {
            isScrubbing = false;
            video.play();
        }
    }

    function timelineMouseMove(e) {
        const timelineContainer = document.querySelector(".gui-timeline");
        const rect = timelineContainer.getBoundingClientRect();

        const percent =
            (Math.min(Math.max(0, e.x - rect.x), rect.width) / rect.width) *
            100;
        mousePosPercent = percent;

        if (isScrubbing) {
            video.currentTime = (video.duration / 100) * percent;
            currentTime = utils.returnFormatedTime(video.currentTime);
            progressPercent = percent;
        }
    }

    function timelineMouseDown(e) {
        if (!isScrubbing) {
            isScrubbing = true;
            video.pause();

            const timelineContainer = document.querySelector(".gui-timeline");
            const rect = timelineContainer.getBoundingClientRect();

            const percent =
                (Math.min(Math.max(0, e.x - rect.x), rect.width) / rect.width) *
                100;

            video.currentTime = (video.duration / 100) * percent;
            currentTime = utils.returnFormatedTime(video.currentTime);
            progressPercent = percent;
        }
    }

    function timelineMouseUp(e) {
        isScrubbing = false;
        video.play();
    }
</script>

<div
    class="player-gui"
    class:hide-gui={isHidden && !isPaused}
    style="--back-transparent: {transparentPercent / 100}"
    onmousemove={playerMouseMove}
    onmouseup={playerMouseUp}
    onclick={onClickGui}
>
    <div class="gui-top-bar">
        <div class="gui-title flex-column">
            <span class="gui-release-title">{args.release.title_ru}</span>
            <span class="gui-release-episode">
                {args.episodes[0].source.type.name} | {cEpisode.name}
            </span>
        </div>
    </div>
    <div class="gui-middle-bar">
        <button
            class="gui-play-button"
            onclick={(e) => {
                video.paused ? video.play() : video.pause();
                e.target.blur();
            }}
        >
            {#if isPaused}
                ▶
            {:else}
                ❚❚
            {/if}
        </button>
    </div>
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
                avaliableQuality: args.avaliableQuality,
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
    <div class="gui-bottom-bar flex-column">
        <div class="top-content container flex-row">
            <div class="left-content">
                <div class="time-container">
                    <div class="time-info flex-row">
                        <span id="current-time">{currentTime ?? "00:00"}</span>
                        <span class="delimiter">/</span>
                        <span id="duration-time">{durationTime ?? "00:00"}</span>
                    </div>
                </div>
            </div>
            <div class="right-content flex-row">
                <div class="gui-volume-control">
                    <input
                        type="range"
                        id="volume-position"
                        min="0"
                        max="1"
                        step="0.01"
                        class="volume-input"
                        style="--volume-position: {volumePercent}%"
                        oninput={function () {
                            volumePercent =
                                ((this.value - this.min) /
                                    (this.max - this.min)) *
                                100;
                        }}
                    />
                </div>
                <button
                    class="gui-bottom-button"
                    onclick={(e) => {
                        e.stopPropagation();
                        showSettings = !showSettings;
                    }}
                >
                    <img
                        src="./assets/icons/settingsFilled.svg"
                        alt="settings"
                        width="28px"
                        height="28px"
                    />
                </button>
                <button
                    class="gui-bottom-button"
                    title="Скрыть интерфейс"
                    onclick={(e) => {
                        e.stopPropagation();
                        forceHide();
                    }}
                >
                    <img
                        src="./assets/icons/view.svg"
                        alt="hide"
                        width="26px"
                        height="26px"
                    />
                </button>
                <button class="gui-bottom-button" onclick={() => {}}>
                    <img
                        src="./assets/icons/pipButton.svg"
                        alt="PiP"
                        width="30px"
                        height="28px"
                    />
                </button>
                <button
                    class="gui-bottom-button"
                    onclick={() => {
                        isFullscreen
                            ? elecWindow.exitFullscreen()
                            : elecWindow.enterFullscreen();
                    }}
                >
                    <img
                        src="./assets/icons/{isFullscreen
                            ? 'exitFullscreen.svg'
                            : 'joinFullscreen.svg'}"
                        alt="fullscreen"
                        width="20px"
                        height="20px"
                    />
                </button>
            </div>
        </div>
        <div class="middle-content container flex-row">
            <div
                class="gui-timeline"
                onmouseenter={() => {
                    showTimelineMouse = true;
                }}
                onmouseleave={() => {
                    showTimelineMouse = false;
                }}
                onmousemove={timelineMouseMove}
                onmousedown={timelineMouseDown}
                onmouseup={timelineMouseUp}
            >
                <div
                    class="timeline"
                    style="--progress-position: {progressPercent}%; --loaded-position: {loadedPercent}%"
                >
                    {#if skipTimes?.op && video?.duration}
                        <div class="skip-segment op" style="left: {(skipTimes.op.start / video.duration) * 100}%; width: {((skipTimes.op.end - skipTimes.op.start) / video.duration) * 100}%"></div>
                    {/if}
                    {#if skipTimes?.ed && video?.duration}
                        <div class="skip-segment ed" style="left: {(skipTimes.ed.start / video.duration) * 100}%; width: {((skipTimes.ed.end - skipTimes.ed.start) / video.duration) * 100}%"></div>
                    {/if}
                    <div
                        class="timeline-dot"
                        style={isScrubbing ? "--scale: 1.6" : ""}
                    ></div>
                    <div
                        class="timeline-mouse"
                        style="--mouse-position: {mousePosPercent}%"
                        class:hide={!showTimelineMouse || isScrubbing}
                    ></div>
                </div>
            </div>
        </div>
        <div class="bottom-content container flex-row">
            <div class="left-content flex-row">
                <button
                    class="player-bottom-button"
                    onclick={showEpisodesDropdown}
                >
                    <img src="./assets/icons/episodeIcon.svg" alt="episode" />
                    <span>Серии</span>
                </button>
                <button
                    class="player-bottom-button"
                    onclick={showDubbersDropdown}
                >
                    <img
                        src="./assets/icons/dubbersIcon.svg"
                        width="22px"
                        alt="dubbers"
                    />
                    <span>Озвучка</span>
                </button>
                <button
                    class="player-bottom-button"
                    class:bottom-disabled={args.release.related_count == 0}
                    onclick={() => {
                        if (args.release.related_count > 0)
                            showRelatedReleasesDropdown();
                    }}
                >
                    <img src="./assets/icons/linkedRelease.svg" alt="linked" />
                    <span>Связанные релизы</span>
                </button>
            </div>
            <div class="right-content flex-row">
                <div style="position: relative; display: flex;">
                    {#if showSkipSlider}
                        <div class="skip-slider-popover" onclick={(e) => e.stopPropagation()}>
                            <button class="skip-slider-close" onclick={() => showSkipSlider = false}>✕</button>
                            <div class="skip-slider-title">Пропуск опенинга: {skipTime} сек.</div>
                            <input
                                type="range"
                                min="10"
                                max="300"
                                step="5"
                                value={skipTime}
                                oninput={(e) => {
                                    skipTime = parseInt(e.target.value);
                                    saveSkipTime(skipTime);
                                }}
                            />
                        </div>
                    {/if}
                    <button
                        class="player-bottom-button"
                        onmousedown={handleSkipMouseDown}
                        onmouseup={handleSkipMouseUp}
                        onmouseleave={handleSkipMouseLeave}
                    >
                        <img src="./assets/icons/skipOp.svg" alt="skipOp" />
                        <span>Пропуск опенинга</span>
                    </button>
                </div>
                <button
                    class="player-bottom-button"
                    class:bottom-disabled={cEpisode.position ==
                        args.episodes.length}
                    onclick={async () => {
                        let e = args.episodes[args.episodes.findIndex(
                            (x) => x.position == cEpisode.position,
                        ) + 1];

                        if (e) {
                            cEpisode = e;
                            await playVideo(cEpisode);
                        }
                    }}
                >
                    <img src="./assets/icons/next.svg" alt="next" />
                    <span
                        >{args.episodes[args.episodes.findIndex(
                            (x) => x.position == cEpisode.position,
                        ) + 1]?.name ?? "Серия отсутствует"}</span
                    >
                </button>
            </div>
        </div>
    </div>

    {#if skipToastMessage}
        <div class="skip-toast">
            {skipToastMessage}
        </div>
    {/if}

    {#if resumeToastMessage}
        <div class="resume-toast flex-row">
            <span>{resumeToastMessage}</span>
            <button class="resume-restart-btn" onclick={performRestartVideo}>
                С начала
            </button>
        </div>
    {/if}

    {#if activeSkipType}
        <button
            class="skip-interval-button flex-row"
            onclick={() => {
                if (activeSkipType === 'op' && performSkipOp) performSkipOp();
                if (activeSkipType === 'ed' && performSkipEd) performSkipEd();
            }}
        >
            <img src="./assets/icons/skipOp.svg" alt="skip" width="20px" height="20px" />
            <span>Пропустить {activeSkipType === 'op' ? 'опенинг' : 'эндинг'}</span>
        </button>
    {/if}
</div>

<style>
    .skip-segment {
        position: absolute;
        height: 100%;
        background-color: rgba(255, 255, 255, 0.4);
        z-index: 1;
        pointer-events: none;
        border-radius: 2px;
    }

    .skip-toast {
        position: absolute;
        bottom: 110px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85);
        color: var(--main-text-color);
        padding: 10px 22px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: bold;
        border: 1px solid var(--select-button-left-color);
        z-index: 10;
        pointer-events: none;
    }

    .resume-toast {
        position: absolute;
        bottom: 110px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(18, 18, 24, 0.92);
        color: var(--main-text-color);
        padding: 8px 18px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 600;
        border: 1px solid var(--select-button-left-color);
        z-index: 10;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    }

    .resume-restart-btn {
        background: var(--select-button-left-color);
        color: var(--main-text-color);
        padding: 4px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        transition: filter 0.2s;
    }

    .resume-restart-btn:hover {
        filter: brightness(1.2);
    }

    .skip-interval-button {
        position: absolute;
        bottom: 120px;
        right: 40px;
        background: var(--select-button-left-color);
        color: var(--main-text-color);
        padding: 12px 22px;
        border-radius: 12px;
        font-size: 15px;
        font-weight: bold;
        cursor: pointer;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
        transition: transform 0.15s ease, background 0.15s ease;
    }

    .skip-interval-button:hover {
        transform: scale(1.05);
        background: var(--player-middle-button-select);
    }
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

    .bottom-disabled {
        opacity: 0.7;
    }

    .bottom-disabled:hover {
        background-color: var(--alt-background-color) !important;
    }

    .bottom-disabled:active {
        background-color: var(--alt-background-color) !important;
    }

    .bottom-disabled:hover {
        cursor: default;
    }

    .player-bottom-button {
        height: 43px;
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 0 5px;
        padding: 0 20px;
        border-radius: 40px;
        background-color: var(--alt-background-color);
        transition: background-color 0.15s ease-in-out;
        margin-bottom: 12px;
        margin-top: 8px;
        color: var(--main-text-color);
    }

    .player-bottom-button:hover {
        background-color: var(--select-button-left-color);
    }

    .player-bottom-button:active {
        background-color: var(--click-on-button-player-color);
    }

    .player-bottom-button img {
        margin-right: 8px;
    }

    .player-bottom-button:first-child {
        margin-left: 4px;
    }

    .player-bottom-button:last-child {
        margin-right: 4px;
    }

    .player-bottom-button span {
        font-size: 14px;
        font-weight: 500;
        white-space: pre;
    }

    .timeline {
        width: 100%;
        height: 5px;
        background-color: var(--alt-background-color);
        border-radius: 5px;
        position: relative;
    }

    .timeline .timeline-mouse {
        position: absolute;
        left: 0;
        height: 5px;
        background-color: var(--main-text-color);
        opacity: 0.4;
        width: var(--mouse-position, 0);
        border-radius: 5px;
    }

    .timeline .timeline-dot {
        --scale: 1.3;
        position: absolute;
        left: var(--progress-position, 0);
        transform: translateX(-50%) scale(var(--scale));
        transition: transform 150ms ease-in-out;
        aspect-ratio: 1 / 1;
        border-radius: 100%;
        height: 200%;
        top: -50%;
        background-color: var(--main-text-color);
        z-index: 2;
    }

    .timeline .timeline-dot:hover {
        --scale: 1.6;
    }

    .timeline::before {
        content: "";
        width: var(--loaded-position, 0);
        background-color: var(--player-timeline-loaded-color);
        height: 5px;
        border-radius: 5px;
        position: absolute;
        left: 0;
        transition: all 0.1s ease-in-out;
    }

    .timeline::after {
        content: "";
        width: var(--progress-position, 0);
        background-color: var(--player-timeline-progress-color);
        height: 5px;
        border-radius: 5px;
        position: absolute;
        left: 0;
    }

    .left-content {
        margin-left: 15px;
    }

    .time-info {
        align-items: center;
        justify-content: center;
        justify-items: center;
        background-color: var(--alt-background-color);
        color: var(--main-text-color);
        border-radius: 50px;
        padding: 0 15px;
        font-size: 12px;
        width: max-content;
        height: 30px;
        margin-bottom: 5px;
        min-width: 76px;
    }

    .delimiter {
        margin: 0 auto;
    }

    .hide-gui {
        animation: hide-gui 0.25s forwards;
    }

    /* Keyframe animations */
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

    .gui-middle-bar {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        left: 0;
        right: 0;
        z-index: 3;
        display: flex;
        width: 100%;
        justify-content: center;
        align-items: center;
    }

    .time-container {
        height: 100%;
        display: flex;
        align-items: end;
    }

    .gui-timeline {
        width: 100%;
        margin: 5px 15px;
        display: flex;
        text-align: center;
        justify-content: center;
        align-items: center;
        position: relative;
        height: 15px;
    }

    .gui-play-button {
        display: flex;
        border-radius: 100%;
        width: 60px;
        height: 60px;
        text-align: center;
        justify-content: center;
        align-items: center;
        background-color: var(--player-middle-button);
        transition: background-color 0.2s ease-in-out;
        color: var(--main-text-color);
    }

    .gui-play-button:hover {
        background-color: var(--player-middle-button-select);
    }

    .gui-volume-control {
        display: flex;
        margin-right: 8px;
        text-align: center;
        justify-content: center;
        align-items: center;
    }

    .gui-title {
        margin-left: 35px;
        margin-top: 20px;
    }

    .gui-release-title {
        font-size: 24px;
        color: #fff;
        font-weight: 400;
    }

    .gui-release-episode {
        color: var(--secondary-text-color);
    }

    .gui-fullscreen {
        display: flex;
        margin-left: 10px;
        margin-top: 5px;
        margin-bottom: 5px;
        margin-right: 5px;
        border-radius: 10px;
        width: 40px;
        height: 25px;
        text-align: center;
        justify-content: center;
        align-items: center;
        background-color: var(--alt-background-color);
    }

    .gui-bottom-button {
        width: 45px;
        height: 45px;
        border-radius: 100%;
        display: flex;
        margin: 3px;
        transition: background-color 0.2s ease-in-out;
        justify-content: center;
        align-items: center;
        color: var(--main-text-color);
    }

    .gui-bottom-button:hover {
        background-color: var(--player-middle-button-select);
    }

    .container {
        width: 100%;
    }

    .right-content {
        margin-left: auto;
        margin-right: 10px;
    }

    .volume-input {
        appearance: none;
        width: 100px;
        height: 6px;
        border-radius: 9999px;
        background: linear-gradient(90deg, #ffffff var(--volume-position, 0), #5a5a5a var(--volume-position, 0));
        cursor: pointer;
    }

    .volume-input::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 9999px;
        background: #f0f0f0;
        box-shadow: none;
    }

    .skip-slider-popover {
        position: absolute;
        bottom: 60px;
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--alt-background-color);
        border: 1px solid var(--player-middle-button-select);
        border-radius: 12px;
        padding: 10px 15px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        z-index: 10;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        color: var(--main-text-color);
    }
    
    .skip-slider-title {
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
    }
    
    .skip-slider-popover input[type="range"] {
        width: 150px;
        accent-color: var(--player-timeline-progress-color);
        cursor: pointer;
    }

    .skip-slider-close {
        position: absolute;
        top: 4px;
        right: 6px;
        background: none;
        border: none;
        color: var(--secondary-text-color);
        cursor: pointer;
        font-size: 12px;
        padding: 2px;
    }

    .skip-slider-close:hover {
        color: var(--main-text-color);
    }
</style>
