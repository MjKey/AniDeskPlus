<script>
    import { createEventDispatcher } from "svelte";

    export let video = null;
    export let isPaused = false;
    export let currentTime = "00:00";
    export let durationTime = "00:00";
    export let volumePercent = 50;
    export let isFullscreen = false;
    export let showSettings = false;
    export let cEpisode = {};
    export let episodes = [];
    export let release = {};
    export let playVideo = null;
    export let reloadPlayer = null;
    export let isStalled = false;
    export let captureFrame = null;

    const dispatch = createEventDispatcher();

    function togglePlay(e) {
        if (video) {
            video.paused ? video.play() : video.pause();
            e.currentTarget.blur();
        }
    }

    async function toggleFullscreen(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        if (window.elecWindow) {
            if (isFullscreen) {
                await window.elecWindow.exitFullscreen();
                isFullscreen = false;
            } else {
                await window.elecWindow.enterFullscreen();
                isFullscreen = true;
            }
        } else if (document.documentElement) {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen().catch(() => {});
                isFullscreen = true;
            } else {
                await document.exitFullscreen().catch(() => {});
                isFullscreen = false;
            }
        }
    }

    function onVolumeInput(e) {
        const val = parseFloat(e.currentTarget.value);
        volumePercent = ((val - e.currentTarget.min) / (e.currentTarget.max - e.currentTarget.min)) * 100;
        if (video) {
            video.volume = val;
        }
    }

    async function handleNextEpisode() {
        const idx = episodes.findIndex((x) => x.position == cEpisode.position);
        const nextEp = episodes[idx + 1];
        if (nextEp && playVideo) {
            cEpisode = nextEp;
            await playVideo(cEpisode);
        }
    }
</script>

<!-- Controls Bar (Top Content inside Bottom Bar) -->
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
                value={volumePercent / 100}
                class="volume-input"
                style="--volume-position: {volumePercent}%"
                oninput={onVolumeInput}
            />
        </div>
        {#if isStalled}
        <button
            class="gui-bottom-button"
            title="Обновить плеер"
            onclick={(e) => {
                e.stopPropagation();
                if (reloadPlayer) reloadPlayer();
                else if (playVideo && cEpisode) playVideo(cEpisode);
            }}
        >
            <img
                src="./assets/icons/refresh.svg"
                alt="refresh"
                width="22px"
                height="22px"
                style="filter: invert(1);"
            />
        </button>
        {/if}
        <button
            class="gui-bottom-button"
            title="Сохранить кадр"
            onclick={(e) => {
                e.stopPropagation();
                if (captureFrame) captureFrame();
            }}
        >
            <img
                src="./assets/icons/camera.svg"
                alt="camera"
                width="22px"
                height="22px"
                style="filter: invert(1);"
            />
        </button>
        <button
            class="gui-bottom-button"
            title="Настройки"
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
                dispatch("forceHide");
            }}
        >
            <img
                src="./assets/icons/view.svg"
                alt="hide"
                width="26px"
                height="26px"
            />
        </button>
        <button class="gui-bottom-button" title="Картинка в картинке" onclick={() => {}}>
            <img
                src="./assets/icons/pipButton.svg"
                alt="PiP"
                width="30px"
                height="28px"
            />
        </button>
        <button class="gui-bottom-button" title="Полноэкранный режим" onclick={toggleFullscreen}>
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

<!-- Timeline Slot (Timeline is rendered BELOW buttons and ABOVE bottom navigation) -->
<slot name="timeline" />

<!-- Bottom Navigation Bar -->
<div class="bottom-content container flex-row">
    <div class="left-content flex-row">
        <button class="player-bottom-button" onclick={(e) => { e.stopPropagation(); dispatch("showEpisodesDropdown", e); }}>
            <img src="./assets/icons/episodeIcon.svg" alt="episode" />
            <span>Серии</span>
        </button>
        <button class="player-bottom-button" onclick={(e) => { e.stopPropagation(); dispatch("showDubbersDropdown", e); }}>
            <img src="./assets/icons/dubbersIcon.svg" width="22px" alt="dubbers" />
            <span>Озвучка</span>
        </button>
        <button
            class="player-bottom-button"
            class:bottom-disabled={!release?.related_count}
            onclick={(e) => {
                e.stopPropagation();
                if (release?.related_count > 0) dispatch("showRelatedDropdown");
            }}
        >
            <img src="./assets/icons/linkedRelease.svg" alt="linked" />
            <span>Связанные релизы</span>
        </button>
    </div>
    <div class="right-content flex-row">
        <slot name="skip-controls" />
        <button
            class="player-bottom-button"
            class:bottom-disabled={cEpisode?.position == episodes.length}
            onclick={handleNextEpisode}
        >
            <img src="./assets/icons/next.svg" alt="next" />
            <span>
                {episodes[episodes.findIndex((x) => x.position == cEpisode?.position) + 1]?.name ?? "Серия отсутствует"}
            </span>
        </button>
    </div>
</div>

<style>
    .container {
        width: 100%;
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

    .left-content {
        margin-left: 15px;
    }

    .top-content {
        position: relative;
        z-index: 5;
        pointer-events: auto;
    }

    .right-content {
        margin-left: auto;
        margin-right: 10px;
    }

    .time-container {
        height: 100%;
        display: flex;
        align-items: end;
    }

    .time-info {
        align-items: center;
        justify-content: center;
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

    .gui-volume-control {
        display: flex;
        margin-right: 8px;
        align-items: center;
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

    .player-bottom-button span {
        font-size: 14px;
        font-weight: 500;
        white-space: pre;
    }

    .bottom-disabled {
        opacity: 0.7;
    }

    .bottom-disabled:hover {
        background-color: var(--alt-background-color) !important;
        cursor: default;
    }
</style>
