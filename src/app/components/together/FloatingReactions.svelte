<script>
    import { togetherStore } from '../stores/togetherStore.js';

    let activeReactions = $state([]);
    let lastHandledId = null;

    $effect(() => {
        const reactions = $togetherStore.reactions || [];
        if (reactions.length > 0) {
            const latest = reactions[reactions.length - 1];
            if (latest && latest.id !== lastHandledId) {
                lastHandledId = latest.id;
                spawnFloatingEmoji(latest);
            }
        }
    });

    function spawnFloatingEmoji(reaction) {
        const left = Math.floor(Math.random() * 60) + 20; // 20% to 80% horizontal range
        const item = {
            id: reaction.id || Math.random().toString(36).substring(2, 9),
            emoji: reaction.emoji || '❤️',
            senderName: reaction.senderName || '',
            left: left
        };

        activeReactions = [...activeReactions, item];

        setTimeout(() => {
            activeReactions = activeReactions.filter(r => r.id !== item.id);
        }, 2000);
    }
</script>

<div class="floating-reactions-container">
    {#each activeReactions as item (item.id)}
        <div class="floating-emoji-item" style="left: {item.left}%;">
            <span class="emoji">{item.emoji}</span>
            {#if item.senderName}
                <span class="sender-tag">{item.senderName}</span>
            {/if}
        </div>
    {/each}
</div>

<style>
    .floating-reactions-container {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: 105;
    }

    .floating-emoji-item {
        position: absolute;
        bottom: 80px;
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translateX(-50%);
        animation: floatUpAndFade 2s ease-out forwards;
    }

    .emoji {
        font-size: 38px;
        filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
    }

    .sender-tag {
        font-size: 11px;
        color: #fff;
        background: rgba(0, 0, 0, 0.6);
        padding: 2px 6px;
        border-radius: 8px;
        white-space: nowrap;
        margin-top: 2px;
        backdrop-filter: blur(4px);
    }

    @keyframes floatUpAndFade {
        0% {
            transform: translateX(-50%) translateY(0) scale(0.6);
            opacity: 0;
        }
        20% {
            transform: translateX(-50%) translateY(-30px) scale(1.1);
            opacity: 1;
        }
        80% {
            opacity: 0.9;
        }
        100% {
            transform: translateX(-50%) translateY(-220px) scale(1);
            opacity: 0;
        }
    }
</style>
