<script>
    import { createEventDispatcher, onDestroy } from "svelte";
    import utils from "../../utils";

    export let video = null;
    export let progressPercent = 0;
    export let loadedPercent = 0;
    export let isScrubbing = false;
    export let skipTimes = { op: null, ed: null };

    const dispatch = createEventDispatcher();

    let showTimelineMouse = false;
    let mousePosPercent = 0;
    let timelineContainerEl = null;

    function handleWindowMouseMove(e) {
        if (!timelineContainerEl) return;
        const rect = timelineContainerEl.getBoundingClientRect();
        const percent = (Math.min(Math.max(0, e.clientX - rect.x), rect.width) / rect.width) * 100;
        mousePosPercent = percent;

        if (isScrubbing && video && video.duration) {
            video.currentTime = (video.duration / 100) * percent;
            dispatch("scrub", {
                time: video.currentTime,
                formattedTime: utils.returnFormatedTime(video.currentTime),
                percent,
            });
        }
    }

    function handleWindowMouseUp() {
        if (isScrubbing) {
            isScrubbing = false;
            window.removeEventListener("mousemove", handleWindowMouseMove);
            window.removeEventListener("mouseup", handleWindowMouseUp);
            if (video) video.play();
        }
    }

    function timelineMouseMove(e) {
        const timelineContainer = e.currentTarget;
        timelineContainerEl = timelineContainer;
        const rect = timelineContainer.getBoundingClientRect();
        const percent = (Math.min(Math.max(0, e.clientX - rect.x), rect.width) / rect.width) * 100;
        mousePosPercent = percent;

        if (isScrubbing && video && video.duration) {
            video.currentTime = (video.duration / 100) * percent;
            dispatch("scrub", {
                time: video.currentTime,
                formattedTime: utils.returnFormatedTime(video.currentTime),
                percent,
            });
        }
    }

    function timelineMouseDown(e) {
        if (!isScrubbing && video && video.duration) {
            isScrubbing = true;
            video.pause();

            const timelineContainer = e.currentTarget;
            timelineContainerEl = timelineContainer;
            const rect = timelineContainer.getBoundingClientRect();
            const percent = (Math.min(Math.max(0, e.clientX - rect.x), rect.width) / rect.width) * 100;

            video.currentTime = (video.duration / 100) * percent;
            dispatch("scrub", {
                time: video.currentTime,
                formattedTime: utils.returnFormatedTime(video.currentTime),
                percent,
            });

            window.addEventListener("mousemove", handleWindowMouseMove);
            window.addEventListener("mouseup", handleWindowMouseUp);
        }
    }

    function timelineMouseUp() {
        handleWindowMouseUp();
    }

    onDestroy(() => {
        window.removeEventListener("mousemove", handleWindowMouseMove);
        window.removeEventListener("mouseup", handleWindowMouseUp);
    });
</script>

<div class="middle-content container flex-row">
    <div
        class="gui-timeline"
        onmouseenter={() => (showTimelineMouse = true)}
        onmouseleave={() => (showTimelineMouse = false)}
        onmousemove={timelineMouseMove}
        onmousedown={timelineMouseDown}
        onmouseup={timelineMouseUp}
        role="slider"
        aria-label="Timeline"
        aria-valuenow={progressPercent}
        tabindex="0"
    >
        <div
            class="timeline"
            style="--progress-position: {progressPercent}%; --loaded-position: {loadedPercent}%"
        >
            {#if skipTimes?.op && video?.duration}
                <div
                    class="skip-segment op"
                    style="left: {(skipTimes.op.start / video.duration) * 100}%; width: {((skipTimes.op.end - skipTimes.op.start) / video.duration) * 100}%"
                ></div>
            {/if}
            {#if skipTimes?.ed && video?.duration}
                <div
                    class="skip-segment ed"
                    style="left: {(skipTimes.ed.start / video.duration) * 100}%; width: {((skipTimes.ed.end - skipTimes.ed.start) / video.duration) * 100}%"
                ></div>
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

<style>
    .container {
        width: 100%;
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
        cursor: pointer;
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

    .skip-segment {
        position: absolute;
        height: 100%;
        background-color: rgba(255, 255, 255, 0.4);
        z-index: 1;
        pointer-events: none;
        border-radius: 2px;
    }

    .hide {
        display: none;
    }
</style>
