<script>
    import { createEventDispatcher, onDestroy, onMount } from "svelte";

    export let activeSkipType = null;
    export let releaseId = null;
    export let video = null;
    export let performSkipOp = null;
    export let performSkipEd = null;

    const dispatch = createEventDispatcher();

    export let skipTime = 85;
    let showSkipSlider = false;

    $: if (releaseId) {
        const stored = localStorage.getItem("skipDurations");
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                skipTime = parsed[releaseId] || 85;
            } catch (e) {
                skipTime = 85;
            }
        } else {
            skipTime = 85;
        }
    }

    function saveSkipTime(value) {
        if (!releaseId) return;
        const stored = localStorage.getItem("skipDurations");
        let parsed = {};
        if (stored) {
            try {
                parsed = JSON.parse(stored);
            } catch (e) {}
        }
        parsed[releaseId] = value;
        localStorage.setItem("skipDurations", JSON.stringify(parsed));
    }

    function handleSkipWheel(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) {
            skipTime = Math.min(300, skipTime + 5);
        } else if (e.deltaY > 0) {
            skipTime = Math.max(5, skipTime - 5);
        }
        saveSkipTime(skipTime);
    }

    function performSkip() {
        if (video) {
            video.currentTime = video.currentTime + skipTime;
            dispatch("skipPerformed", { skipTime });
        }
    }
</script>

{#if activeSkipType}
    <div class="skip-interval-row container flex-row">
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
    </div>
{/if}

<div class="skip-controls-wrapper">
    <div style="position: relative; display: flex;">
        {#if showSkipSlider}
            <div class="skip-slider-popover" onclick={(e) => e.stopPropagation()} role="dialog">
                <button class="skip-slider-close" onclick={() => (showSkipSlider = false)}>✕</button>
                <div class="skip-slider-title">Пропуск опенинга: {skipTime} сек.</div>
                <input
                    type="range"
                    min="10"
                    max="300"
                    step="5"
                    value={skipTime}
                    oninput={(e) => {
                        skipTime = parseInt(e.target.value, 10);
                        saveSkipTime(skipTime);
                    }}
                />
            </div>
        {/if}
        <button
            class="player-bottom-button"
            title="Клик: перемотать | Колёсико мыши: изменить время ({skipTime} сек)"
            onclick={performSkip}
            onwheel={handleSkipWheel}
        >
            <img src="./assets/icons/skipOp.svg" alt="skipOp" />
            <span>Быстрая перемотка {skipTime} сек.</span>
        </button>
    </div>
</div>

<style>
    .skip-interval-row {
        position: absolute;
        bottom: 150px;
        right: 25px;
        z-index: 10;
        display: flex;
        justify-content: flex-end;
        pointer-events: auto;
    }

    .skip-interval-button {
        background: var(--select-button-left-color);
        color: var(--main-text-color);
        padding: 8px 18px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
        transition: transform 0.15s ease, background 0.15s ease;
    }

    .skip-interval-button:hover {
        transform: scale(1.04);
        background: var(--player-middle-button-select);
    }

    .skip-controls-wrapper {
        display: flex;
        align-items: center;
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
