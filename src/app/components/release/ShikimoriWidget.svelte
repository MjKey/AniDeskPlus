<script>
    import { onMount } from "svelte";
    import {
        searchShikimoriAnimeGraphQL,
        getShikimoriUserRate,
        saveShikimoriUserRate,
        ShikimoriStatuses
    } from "../../utils/shikimori";

    export let release;
    export let mode = "full"; // "full" for release page, "badge" for mini rating

    let shikiAnime = null;
    let shikiUserRate = null;
    let shikiToken = null;
    let shikiUser = null;
    let isLoading = true;
    let isSaving = false;

    onMount(async () => {
        try {
            shikiToken = localStorage.getItem("shikimori_token");
            const userStr = localStorage.getItem("shikimori_user");
            if (userStr) shikiUser = JSON.parse(userStr);

            // Do not send any network requests to Shikimori if no token is connected
            if (!shikiToken) {
                isLoading = false;
                return;
            }

            if (release) {
                shikiAnime = await searchShikimoriAnimeGraphQL(release.title_original, release.title_ru, shikiToken);
                if (shikiAnime) {
                    if (shikiAnime.userRate) {
                        shikiUserRate = shikiAnime.userRate;
                    } else if (shikiToken && shikiUser?.id) {
                        shikiUserRate = await getShikimoriUserRate(shikiAnime.id, shikiToken, shikiUser.id);
                    }
                }
            }
        } catch (e) {
            console.error("[ShikimoriWidget] error:", e);
        } finally {
            isLoading = false;
        }
    });

    async function handleStatusChange(newStatus) {
        if (!shikiAnime || !shikiToken || !shikiUser?.id || isSaving) return;
        isSaving = true;
        const currentEp = shikiUserRate?.episodes ?? 0;
        const updated = await saveShikimoriUserRate(
            shikiAnime.id,
            shikiToken,
            shikiUser.id,
            newStatus,
            currentEp,
            shikiUserRate?.id
        );
        if (updated) {
            shikiUserRate = updated;
        }
        isSaving = false;
    }

    async function handleEpisodesChange(delta) {
        if (!shikiAnime || !shikiToken || !shikiUser?.id || isSaving) return;
        isSaving = true;
        const currentEp = shikiUserRate?.episodes ?? 0;
        const maxEp = shikiAnime.episodes || 9999;
        const newEp = Math.max(0, Math.min(maxEp, currentEp + delta));
        let newStatus = shikiUserRate?.status || "watching";

        if (maxEp > 0 && newEp >= maxEp) {
            newStatus = "completed";
        }

        const updated = await saveShikimoriUserRate(
            shikiAnime.id,
            shikiToken,
            shikiUser.id,
            newStatus,
            newEp,
            shikiUserRate?.id
        );
        if (updated) {
            shikiUserRate = updated;
        }
        isSaving = false;
    }
</script>

{#if mode === "badge"}
    {#if shikiAnime?.score}
        <div class="shiki-mini-badge flex-row" title="Рейтинг Shikimori">
            <span class="shiki-icon">⭐</span>
            <span class="shiki-score">{shikiAnime.score}</span>
            <span class="shiki-label">Shikimori</span>
        </div>
    {/if}
{:else}
    <div class="shikimori-widget flex-column">
        <div class="shikimori-header flex-row">
            <div class="shikimori-title-block flex-row">
                <span class="shiki-logo">🌸</span>
                <span class="shiki-title">Shikimori</span>
            </div>
            {#if shikiAnime?.score}
                <div class="shiki-score-badge flex-row">
                    <span class="star-icon">⭐</span>
                    <span class="score-val">{shikiAnime.score}</span>
                </div>
            {/if}
        </div>

        {#if isLoading}
            <div class="shiki-loading">Загрузка данных с Shikimori...</div>
        {:else if shikiAnime}
            {#if shikiToken && shikiUser}
                <div class="shiki-user-controls flex-column">
                    <div class="status-selector flex-row">
                        <span class="control-label">Ваш статус:</span>
                        <div class="status-buttons flex-row">
                            {#each ShikimoriStatuses as st}
                                <button
                                    class="status-btn"
                                    class:active={shikiUserRate?.status === st.value}
                                    disabled={isSaving}
                                    onclick={() => handleStatusChange(st.value)}
                                >
                                    {st.label}
                                </button>
                            {/each}
                        </div>
                    </div>

                    <div class="episodes-selector flex-row">
                        <span class="control-label">Просмотрено серий:</span>
                        <div class="episodes-counter flex-row">
                            <button
                                class="ep-btn"
                                disabled={isSaving || (shikiUserRate?.episodes ?? 0) <= 0}
                                onclick={() => handleEpisodesChange(-1)}>-1</button
                            >
                            <span class="ep-text">
                                <strong>{shikiUserRate?.episodes ?? 0}</strong> / {shikiAnime.episodes || '?'}
                            </span>
                            <button
                                class="ep-btn"
                                disabled={isSaving}
                                onclick={() => handleEpisodesChange(1)}>+1</button
                            >
                        </div>
                    </div>
                </div>
            {:else}
                <div class="shiki-auth-prompt flex-row">
                    <span>Подключите Shikimori в Настройках, чтобы синхронизировать статус и просмотренные серии.</span>
                </div>
            {/if}
        {:else}
            <div class="shiki-not-found">Аниме не найдено в базе Shikimori</div>
        {/if}
    </div>
{/if}

<style>
    .shiki-mini-badge {
        align-items: center;
        gap: 4px;
        background-color: var(--alt-background-color);
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 12px;
        color: var(--main-text-color);
    }

    .shiki-score {
        font-weight: bold;
        color: #f39c12;
    }

    .shiki-label {
        font-size: 10px;
        color: var(--secondary-text-color);
    }

    .shikimori-widget {
        background-color: var(--alt-background-color);
        border-radius: 14px;
        padding: 14px 18px;
        margin-top: 15px;
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .shikimori-header {
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }

    .shikimori-title-block {
        align-items: center;
        gap: 8px;
    }

    .shiki-logo {
        font-size: 18px;
    }

    .shiki-title {
        font-size: 16px;
        font-weight: bold;
        color: var(--main-text-color);
    }

    .shiki-score-badge {
        background-color: rgba(243, 156, 18, 0.15);
        border: 1px solid rgba(243, 156, 18, 0.4);
        padding: 4px 10px;
        border-radius: 8px;
        align-items: center;
        gap: 4px;
    }

    .score-val {
        font-weight: bold;
        color: #f39c12;
        font-size: 15px;
    }

    .shiki-loading,
    .shiki-not-found {
        font-size: 13px;
        color: var(--secondary-text-color);
    }

    .shiki-auth-prompt {
        font-size: 12px;
        color: var(--secondary-text-color);
        background-color: var(--alt-gray-background-color);
        padding: 8px 12px;
        border-radius: 8px;
    }

    .shiki-user-controls {
        gap: 10px;
        margin-top: 5px;
    }

    .control-label {
        font-size: 13px;
        color: var(--secondary-text-color);
        min-width: 140px;
    }

    .status-selector,
    .episodes-selector {
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
    }

    .status-buttons {
        gap: 5px;
        flex-wrap: wrap;
    }

    .status-btn {
        background-color: var(--alt-gray-background-color);
        color: var(--secondary-text-color);
        border-radius: 6px;
        padding: 5px 10px;
        font-size: 12px;
        cursor: pointer;
        transition: background-color 0.2s, color 0.2s;
    }

    .status-btn.active {
        background-color: var(--select-button-left-color);
        color: var(--main-text-color);
        font-weight: bold;
    }

    .status-btn:hover:not(.active) {
        background-color: var(--select-button-color);
        color: var(--main-text-color);
    }

    .episodes-counter {
        align-items: center;
        gap: 10px;
    }

    .ep-btn {
        background-color: var(--select-button-left-color);
        color: var(--main-text-color);
        border-radius: 6px;
        width: 32px;
        height: 32px;
        font-weight: bold;
        cursor: pointer;
    }

    .ep-btn:hover:not(:disabled) {
        opacity: 0.8;
    }

    .ep-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .ep-text {
        font-size: 14px;
        color: var(--main-text-color);
    }
</style>
