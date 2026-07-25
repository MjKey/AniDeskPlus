<script>
    export let titleRu = "";
    export let episodeName = "";
    export let dubberName = "";
    export let onOpenTogetherModal = null;
</script>

<div class="gui-top-bar flex-row">
    <div class="gui-title flex-column">
        <span class="gui-release-title">{titleRu}</span>
        <span class="gui-release-episode">
            {dubberName ? `${dubberName} | ` : ''}{episodeName}
        </span>
    </div>
    {#if onOpenTogetherModal}
        <button class="gui-together-btn flex-row" onclick={onOpenTogetherModal} title="Совместный просмотр (AniTogether)">
            <span>🎬</span>
            <span class="together-text">Смотреть вместе</span>
        </button>
    {/if}
</div>

<style>
    .gui-top-bar {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 3;
        align-items: center;
        justify-content: space-between;
        padding-right: 35px;
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

    .gui-together-btn {
        margin-top: 20px;
        align-items: center;
        gap: 8px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #ffffff;
        padding: 8px 16px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        backdrop-filter: blur(10px);
        transition: all 0.2s ease;
    }

    .gui-together-btn:hover {
        background: rgba(255, 255, 255, 0.22);
        transform: translateY(-1px);
    }
</style>
