<script>
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();

    export let releaseId;
    export let myVote = 0; // 0 = unvoted, 1..5 = voted

    let hoveredVote = 0;
    let isLoading = false;

    $: numericMyVote = Number(myVote) || 0;

    async function setVote(voteVal) {
        if (!anixApi.client.token) {
            dispatch("showAuthModal");
            return;
        }

        if (isLoading) return;
        isLoading = true;

        const targetVote = numericMyVote === voteVal ? 0 : voteVal;

        try {
            if (targetVote === 0) {
                const res = await anixApi.release.removeVote(releaseId);
                if (res && res.code === 0) {
                    myVote = 0;
                    dispatch("voteChange", { vote: 0 });
                }
            } else {
                const res = await anixApi.release.addVote(releaseId, targetVote);
                if (res && res.code === 0) {
                    myVote = targetVote;
                    dispatch("voteChange", { vote: targetVote });
                }
            }
        } catch (e) {
            console.error("Failed to update vote:", e);
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="rating-stars-container flex-column">
    <div class="stars-label">Ваша оценка</div>
    <div class="stars-row flex-row">
        {#each [1, 2, 3, 4, 5] as star}
            <button
                class="star-btn"
                class:active={star <= (hoveredVote || numericMyVote)}
                class:my-star={star <= numericMyVote}
                onmouseenter={() => (hoveredVote = star)}
                onmouseleave={() => (hoveredVote = 0)}
                onclick={() => setVote(star)}
                disabled={isLoading}
                title={`Оценить на ${star} из 5`}
            >
                ★
            </button>
        {/each}

        {#if numericMyVote > 0}
            <button
                class="remove-vote-btn"
                onclick={() => setVote(numericMyVote)}
                disabled={isLoading}
                title="Сбросить оценку"
            >
                ✕
            </button>
        {/if}
    </div>
    {#if numericMyVote > 0}
        <div class="vote-status">{numericMyVote} из 5 звезд</div>
    {:else}
        <div class="vote-status hint">Нажмите на звезду</div>
    {/if}
</div>

<style>
    .rating-stars-container {
        align-items: center;
        background-color: var(--alt-background-color);
        padding: 10px 16px;
        border-radius: 10px;
        margin-top: 10px;
        margin-bottom: 10px;
        border: 1px solid var(--rate-back-color);
    }

    .stars-label {
        font-size: 13px;
        color: var(--secondary-text-color);
        margin-bottom: 6px;
        font-weight: 600;
    }

    .stars-row {
        gap: 6px;
        align-items: center;
    }

    .star-btn {
        background: transparent;
        border: none;
        font-size: 26px;
        color: var(--rate-back-color, #444);
        cursor: pointer;
        padding: 0 2px;
        transition: color 0.15s ease, transform 0.15s ease;
        outline: none;
        line-height: 1;
    }

    .star-btn:hover {
        transform: scale(1.2);
    }

    .star-btn.active {
        color: #ffc107;
    }

    .remove-vote-btn {
        background: transparent;
        border: none;
        color: var(--secondary-text-color);
        font-size: 14px;
        cursor: pointer;
        margin-left: 6px;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .remove-vote-btn:hover {
        color: var(--danger-color);
    }

    .vote-status {
        font-size: 12px;
        color: #ffc107;
        margin-top: 4px;
        font-weight: bold;
    }

    .vote-status.hint {
        color: var(--secondary-text-color);
        font-weight: normal;
    }
</style>
