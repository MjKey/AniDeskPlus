<script>
    import utils from "../../utils";
    import SliderButton from "../buttons/SliderButton.svelte";
    import { fly } from "svelte/transition";
    import { localStorageWritable } from "@babichjacob/svelte-localstorage";

    import { playerSettingsStore } from "../stores/pageHistory.js";

    export let currentSettings;
    export let isShow;
    export let changeQuality;
    export let changeUpscale;
    export let changeAspectRatio;
    export let changeSleepTimer;
    export let video;

    let page = 0;
    let transitionDirection = 1;

    let upscaleSettings;
    let playerSettings = utils.playerDefaultSettings;

    playerSettingsStore.subscribe((value) => {
        playerSettings = {
            ...utils.playerDefaultSettings,
            ...(value || {}),
        };
    });

    function updatePlayerSetting(key, value) {
        playerSettings = {
            ...playerSettings,
            [key]: value,
        };
        playerSettingsStore.set(playerSettings);
        localStorage.setItem("playerSettings", JSON.stringify(playerSettings));
    }

    let customMinutesInput = 30;
    let customEpisodesInput = 1;

    const upscaleSettingsRaw = localStorageWritable(
        "upscaleSettings",
        utils.upscaleDefaultSettings,
    );

    upscaleSettingsRaw.subscribe((value) => {
        upscaleSettings = value;
    });
</script>

{#if isShow}
    <div
        class="player-settings flex-column"
        onclick={(e) => e.stopPropagation()}
        onwheel={(e) => e.stopPropagation()}
    >
        {#if page === 0}
            <div
                class="page"
                in:fly={{ x: 300 * transitionDirection, duration: 250 }}
                out:fly={{ x: -300 * transitionDirection, duration: 250 }}
            >
                <button
                    class="player-settings-element"
                    onclick={() => {
                        transitionDirection = 1;
                        page = 1;
                    }}
                >
                    <span class="btn-title">Качество:</span>
                    <span>{currentSettings.currentQuality}p →</span>
                </button>
                <div class="player-settings-element" class:disabled={!upscaleSettings.enabled || !avaliableGPU}>
                    <span class="btn-title">Улучшение качества:</span>
                    <SliderButton
                        disabled={!upscaleSettings.enabled || !avaliableGPU}
                        value={!avaliableGPU ? false : currentSettings.upscaleEnabled}
                        onClickCallback={(value) => changeUpscale(value)}
                    />
                </div>
                <div class="player-settings-element">
                    <span class="btn-title">Запоминать позицию:</span>
                    <SliderButton
                        value={playerSettings?.rememberPosition ?? true}
                        onClickCallback={(value) => updatePlayerSetting("rememberPosition", value)}
                    />
                </div>
                <div class="player-settings-element">
                    <span class="btn-title">Автопропуск опенинга:</span>
                    <SliderButton
                        value={playerSettings?.autoSkipOpening ?? false}
                        onClickCallback={(value) => updatePlayerSetting("autoSkipOpening", value)}
                    />
                </div>
                <div class="player-settings-element">
                    <span class="btn-title">Автопропуск эндинга:</span>
                    <SliderButton
                        value={playerSettings?.autoSkipEnding ?? false}
                        onClickCallback={(value) => updatePlayerSetting("autoSkipEnding", value)}
                    />
                </div>
                <button
                    class="player-settings-element"
                    onclick={() => {
                        transitionDirection = 1;
                        page = 2;
                    }}
                >
                    <span class="btn-title">Соотношение сторон:</span>
                    <span>{currentSettings.aspectRatio} →</span>
                </button>
                <button
                    class="player-settings-element"
                    onclick={() => {
                        transitionDirection = 1;
                        page = 3;
                    }}
                >
                    <span class="btn-title">Скорость:</span>
                    <span
                        >{utils.playerSpeedValues.find(
                            (x) => x.value == video.playbackRate,
                        ).label} →</span
                    >
                </button>
                <button
                    class="player-settings-element"
                    onclick={() => {
                        transitionDirection = 1;
                        page = 4;
                    }}
                >
                    <span class="btn-title">Таймер сна:</span>
                    <span>{currentSettings.sleepTimerLabel ?? "Выкл"} →</span>
                </button>
            </div>
        {:else if page === 1}
            <div
                class="page"
                in:fly={{ x: 300 * transitionDirection, duration: 250 }}
                out:fly={{ x: -300 * transitionDirection, duration: 250 }}
            >
                <button
                    class="player-settings-element back"
                    onclick={() => {
                        transitionDirection = -1;
                        page = 0;
                    }}
                >
                    ← Назад
                </button>
                {#each Object.keys(currentSettings.avaliableQuality).reverse() as option}
                    <button
                        class="player-settings-element"
                        onclick={() => {
                            transitionDirection = -1;
                            changeQuality(option);
                            page = 0;
                        }}
                    >
                        {option}p
                    </button>
                {/each}
            </div>
        {:else if page === 2}
            <div
                class="page"
                in:fly={{ x: 300 * transitionDirection, duration: 250 }}
                out:fly={{ x: -300 * transitionDirection, duration: 250 }}
            >
                <button
                    class="player-settings-element back"
                    onclick={() => {
                        transitionDirection = -1;
                        page = 0;
                    }}
                >
                    ← Назад
                </button>
                {#each utils.aspectRatioValues as option}
                    <button
                        class="player-settings-element"
                        onclick={() => {
                            transitionDirection = -1;
                            currentSettings.aspectRatio = option.label;
                            changeAspectRatio(option.value);
                            page = 0;
                        }}
                    >
                        {option.label}
                    </button>
                {/each}
            </div>
        {:else if page === 3}
            <div
                class="page"
                in:fly={{ x: 300 * transitionDirection, duration: 250 }}
                out:fly={{ x: -300 * transitionDirection, duration: 250 }}
            >
                <button
                    class="player-settings-element back"
                    onclick={() => {
                        transitionDirection = -1;
                        page = 0;
                    }}
                >
                    ← Назад
                </button>
                {#each utils.playerSpeedValues as option}
                    <button
                        class="player-settings-element"
                        onclick={() => {
                            transitionDirection = -1;
                            video.playbackRate = option.value;
                            page = 0;
                        }}
                    >
                        {option.label}
                    </button>
                {/each}
            </div>
        {:else if page === 4}
            <div
                class="page"
                in:fly={{ x: 300 * transitionDirection, duration: 250 }}
                out:fly={{ x: -300 * transitionDirection, duration: 250 }}
            >
                <button
                    class="player-settings-element back"
                    onclick={() => {
                        transitionDirection = -1;
                        page = 0;
                    }}
                >
                    ← Назад
                </button>
                {#each utils.sleepTimerDurationValues as option}
                    <button
                        class="player-settings-element"
                        onclick={() => {
                            transitionDirection = -1;
                            changeSleepTimer(option);
                            page = 0;
                        }}
                    >
                        {option.label}
                    </button>
                {/each}
                <button
                    class="player-settings-element"
                    onclick={() => {
                        transitionDirection = 1;
                        page = 5;
                    }}
                >
                    <span class="btn-title">Свой вариант...</span>
                    <span>→</span>
                </button>
            </div>
        {:else if page === 5}
            <div
                class="page"
                in:fly={{ x: 300 * transitionDirection, duration: 250 }}
                out:fly={{ x: -300 * transitionDirection, duration: 250 }}
            >
                <button
                    class="player-settings-element back"
                    onclick={() => {
                        transitionDirection = -1;
                        page = 4;
                    }}
                >
                    ← Назад
                </button>
                <div class="custom-timer-block">
                    <span class="custom-label">Через N минут:</span>
                    <div class="custom-row">
                        <input type="number" min="1" max="600" bind:value={customMinutesInput} class="custom-input" />
                        <button class="custom-btn" onclick={() => {
                            transitionDirection = -1;
                            changeSleepTimer({ type: "minutes", minutes: customMinutesInput });
                            page = 0;
                        }}>Старт</button>
                    </div>
                </div>
                <div class="custom-timer-block">
                    <span class="custom-label">Через N серий:</span>
                    <div class="custom-row">
                        <input type="number" min="1" max="99" bind:value={customEpisodesInput} class="custom-input" />
                        <button class="custom-btn" onclick={() => {
                            transitionDirection = -1;
                            changeSleepTimer({ type: "episodes", count: customEpisodesInput });
                            page = 0;
                        }}>Старт</button>
                    </div>
                </div>
            </div>
        {/if}
    </div>
{/if}

<style>
    .player-settings {
        background-color: var(--background-color);
        width: 250px;
        border-radius: 15px;
        display: flex;
        flex-direction: row;
        align-items: center;
        overflow: hidden;
        position: relative;
    }

    .btn-title {
        font-weight: bold;
    }

    .page {
        width: 250px !important;
        height: 100% !important;
        min-width: 250px !important;
        display: flex;
        flex-direction: column;
    }

    .player-settings-element {
        height: 40px;
        font-size: 14px;
        color: var(--main-text-color);
        text-align: left;
        padding: 0 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 0 15px;
        box-sizing: border-box;
    }

    .player-settings-element:hover {
        background-color: var(--alt-background-color);
    }

    .custom-timer-block {
        display: flex;
        flex-direction: column;
        padding: 8px 15px;
        gap: 5px;
    }

    .custom-label {
        font-size: 12px;
        color: var(--secondary-text-color);
        font-weight: bold;
    }

    .custom-row {
        display: flex;
        flex-direction: row;
        gap: 8px;
        align-items: center;
    }

    .custom-input {
        width: 100px;
        height: 32px;
        border-radius: 8px;
        border: 1px solid var(--alt-background-color);
        background-color: var(--alt-background-color);
        color: var(--main-text-color);
        padding: 0 10px;
        font-size: 14px;
        box-sizing: border-box;
    }

    .custom-btn {
        height: 32px;
        padding: 0 14px;
        border-radius: 8px;
        background-color: var(--select-button-left-color);
        color: var(--main-text-color);
        font-size: 13px;
        font-weight: 500;
    }

    .custom-btn:hover {
        background-color: var(--player-middle-button-select);
    }
</style>
