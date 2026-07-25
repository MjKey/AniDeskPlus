<script>
    export let titleRu = "";
    export let episodeName = "";
    export let dubberName = "";
</script>

<div class="gui-top-bar">
    <div class="gui-title flex-column">
        <span class="gui-release-title">{titleRu}</span>
        <span class="gui-release-episode">
            {dubberName ? `${dubberName} | ` : ''}{episodeName}
        </span>
    </div>
</div>

<style>
    .gui-top-bar {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 3;
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
</style>
