<script>
    export let skipToastMessage = null;
    export let resumeToastMessage = null;
    export let performRestartVideo = null;
</script>

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

<style>
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
</style>
