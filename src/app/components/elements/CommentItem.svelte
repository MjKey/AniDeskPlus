<script>
    export let comment;
    import { Lottie } from "lottie-svelte";
    import BaseMainButton from "../buttons/BaseMainButton.svelte";
    import Icon from "./Icon.svelte";
    import { Pages } from "../../pages.js";
    import upVoteIcon from "../../icons/upVote.svg";
    import downVoteIcon from "../../icons/downVote.svg";
    import ProfileAvatar from "../profile/ProfileAvatar.svelte";
    import { createEventDispatcher } from "svelte";
    import { localStorageWritable } from "@babichjacob/svelte-localstorage";

    const dispatch = createEventDispatcher();

    let showedReply = false,
        spoilerView = false;
    let replies = [];

    let isEditing = false;
    let editMessage = comment.message;
    let editSpoiler = comment.is_spoiler;
    let isSaving = false;

    let currentUserId = null;
    const userToken = localStorageWritable("user_token", null);
    userToken.subscribe((val) => {
        if (val) {
            try {
                const parsed = JSON.parse(val);
                currentUserId = parsed?.id;
            } catch (e) {}
        }
    });

    $: isMyComment = currentUserId && comment.profile && comment.profile.id === currentUserId;

    async function getAllReplies() {
        let totalPages = 1;
        let res = [];

        const firstPage = await anixApi.release.getCommentReplies({
            id: comment.id,
            page: 0,
            sort: 0,
        });
        res = firstPage.content;
        totalPages = firstPage.total_page_count;

        for (let i = 1; i < totalPages; i++) {
            const page = await anixApi.release.getCommentReplies({
                id: comment.id,
                page: i,
                sort: 0,
            });
            res = res.concat(page.content);
        }

        return res;
    }

    async function setVote(vote) {
        const prevVote = comment.vote;
        const prevLikes = comment.likes_count;

        comment.likes_count =
            comment.likes_count +
            (comment.vote == 0
                ? vote == 2
                    ? 1
                    : -1
                : comment.vote != vote && vote == 2
                  ? 2
                  : comment.vote == vote
                    ? vote == 2
                        ? -1
                        : 1
                    : -2);
        comment.vote = comment.vote == vote ? 0 : vote;

        const request = await anixApi.release.voteComment(comment.id, vote);
        if (request.code !== 0) {
            comment.vote = prevVote;
            comment.likes_count = prevLikes;
        }
    }

    async function saveEdit() {
        if (!editMessage.trim()) return;
        isSaving = true;
        try {
            const res = await anixApi.release.editComment(comment.id, editMessage.trim(), editSpoiler);
            if (res.code === 0) {
                comment.message = editMessage.trim();
                comment.is_spoiler = editSpoiler;
                isEditing = false;
            }
        } catch (e) {
            console.error("Failed to edit comment:", e);
        } finally {
            isSaving = false;
        }
    }

    async function handleDelete() {
        if (!confirm("Вы уверены, что хотите удалить этот комментарий?")) return;
        try {
            const res = await anixApi.release.removeComment(comment.id);
            if (res.code === 0) {
                dispatch("deleteComment", comment.id);
            }
        } catch (e) {
            console.error("Failed to delete comment:", e);
        }
    }
</script>

<div class="comment flex-column">
    <div class="comment-author flex-row">
        <div
            class="comment-author-image"
            onclick={() => updateViewportComponent(Pages.PROFILE, comment.profile.id)}
        >
            <ProfileAvatar
                src={comment.profile.avatar}
                alt={comment.profile.login}
                size={{ width: 40, height: 40 }}
            />
        </div>
        <div class="comment-author-info flex-row">
            <div
                class="comment-author-username flex-row"
                onclick={() => updateViewportComponent(Pages.PROFILE, comment.profile.id)}
            >
                {comment.profile.login}
                {#if comment.profile.badge_url}
                    {#if comment.profile.badge_url.endsWith(".json")}
                        <Lottie
                            src={comment.profile.badge_url}
                            height="20"
                            width="20"
                        />
                    {:else}
                        <img
                            height="20"
                            width="20"
                            src={comment.profile.badge_url}
                            alt={comment.profile.badge_name}
                        />
                    {/if}
                {/if}
                {#if comment.profile.is_verified}
                    <div class="verified">
                        <img
                            height="20"
                            width="20"
                            src="./assets/icons/verified.svg"
                            alt="verified"
                        />
                    </div>
                {/if}
            </div>
            <div class="comment-author-date flex-row">
                {utils.returnTimeString(comment.timestamp * 1000)}
            </div>
            <BaseMainButton
                customClasses="comment-reply-button"
                borderRadius={6}
                height={25}
                onClickCallback={() => {
                    if (anixApi.client.token) {
                        dispatch("reply", comment);
                    } else {
                        dispatch("showAuthModal");
                    }
                }}
                ><img
                    src="assets/icons/reply.svg"
                    alt="reply"
                /></BaseMainButton
            >
            {#if isMyComment}
                <button class="comment-action-btn" onclick={() => (isEditing = !isEditing)} title="Редактировать">
                    ✏️
                </button>
                <button class="comment-action-btn delete" onclick={handleDelete} title="Удалить">
                    🗑️
                </button>
            {/if}
        </div>
    </div>
    <div class="comment-message flex-row">
        <div class="comment-like-count flex-column">
            <button
                class="upvote"
                onclick={async () => {
                    if (anixApi.client.token) {
                        await setVote(2);
                    } else {
                        dispatch("showAuthModal");
                    }
                }}
            >
                <Icon
                    src={upVoteIcon}
                    size={{ width: 20, heigth: 12 }}
                    varColor={comment.vote == 2
                        ? "--good-reputation-color"
                        : "--gray-btn"}
                />
            </button>
            <span
                class:like-positive={comment.likes_count > 0}
                class:like-negative={comment.likes_count < 0}
                >{comment.likes_count}</span
            >
            <button
                class="downvote"
                onclick={async () => {
                    if (anixApi.client.token) {
                        await setVote(1);
                    } else {
                        dispatch("showAuthModal");
                    }
                }}
            >
                <Icon
                    src={downVoteIcon}
                    size={{ width: 20, heigth: 12 }}
                    varColor={comment.vote == 1
                        ? "--bad-reputation-color"
                        : "--gray-btn"}
                />
            </button>
        </div>
        <div class="comment-msg flex-column">
            {#if isEditing}
                <div class="comment-edit-box flex-column">
                    <textarea bind:value={editMessage} class="comment-edit-textarea"></textarea>
                    <div class="comment-edit-controls flex-row">
                        <label class="spoiler-checkbox">
                            <input type="checkbox" bind:checked={editSpoiler} /> Спойлер
                        </label>
                        <div class="flex-row" style="gap: 8px; margin-left: auto;">
                            <button class="btn-cancel" onclick={() => (isEditing = false)}>Отмена</button>
                            <button class="btn-save" disabled={isSaving} onclick={saveEdit}>Сохранить</button>
                        </div>
                    </div>
                </div>
            {:else}
                <div class="comment-text flex-row">
                    {#if comment.is_spoiler && !spoilerView}
                        <button
                            class="comment-spoiler flex-column"
                            onclick={() => (spoilerView = !spoilerView)}
                        >
                            <div class="spoiler-text flex-column">
                                <span>Данный комментарий содержит спойлер</span>
                                <span class="spoiler-subtitle"
                                    >Для того чтобы посмотреть комментарий, нажмите
                                    здесь</span
                                >
                            </div>
                        </button>
                    {/if}
                    <span
                        class="message-text"
                        class:spoiler-blur={comment.is_spoiler && !spoilerView}
                        >{comment.message}</span
                    >
                </div>
            {/if}
            {#if comment.reply_count > 0}
                <button
                    class="comment-reply-count"
                    onclick={async () => {
                        showedReply = !showedReply;
                        replies = showedReply ? await getAllReplies() : [];
                    }}
                    ><img src="assets/icons/doubleReply.svg" alt="reply" />
                    {showedReply ? "Скрыть" : "Показать"}
                    {comment.reply_count}
                    {utils.getNumericWord(comment.reply_count, [
                        "ответ",
                        "ответа",
                        "ответов",
                    ])}</button
                >
            {/if}
            {#if showedReply && replies.length > 0}
                <div class="comment-replies flex-column">
                    {#each replies as reply}
                        <svelte:self
                            comment={reply}
                            on:reply={(e) => dispatch("reply", e.detail)}
                            on:deleteComment={(e) => {
                                replies = replies.filter((r) => r.id !== e.detail);
                                comment.reply_count = Math.max(0, comment.reply_count - 1);
                            }}
                            on:showAuthModal={() => dispatch("showAuthModal")}
                        ></svelte:self>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .verified {
        display: flex;
        align-content: center;
    }

    .comment-spoiler {
        position: absolute;
        left: -15px;
        top: -10px;
        background-color: var(--comment-spoiler-color);
        width: 102%;
        justify-content: center;
        align-items: center;
        border-radius: 15px;
        min-height: 40px;
        z-index: 2;
        height: calc(100% + 20px);
    }

    .comment-text {
        position: relative;
        color: var(--main-text-color);
    }

    .message-text {
        white-space: break-spaces;
    }

    .spoiler-blur {
        filter: blur(8px);
    }

    .comment-replies {
        margin-top: 5px;
    }

    .spoiler-subtitle {
        color: var(--secondary-text-color);
    }

    .comment-msg {
        width: 100%;
    }

    :global(.comment-reply-button) {
        padding-left: 8px;
        padding-right: 8px;
        margin-left: 10px;
    }

    .comment-reply-count {
        display: flex;
        margin-top: 12px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        color: var(--main-text-color);
        align-items: center;
    }

    .comment-reply-count img {
        margin-right: 5px;
    }

    .comment {
        margin-top: 10px;
        margin-bottom: 10px;
    }

    .comment-author-info {
        align-items: center;
    }

    .comment-author {
        object-fit: cover;
    }

    .comment-author-image {
        margin-right: 10px;
        margin-bottom: 8px;
        cursor: pointer;
    }

    .comment-message {
        font-size: 14px;
        color: var(--main-text-color);
        font-weight: 400;
    }

    .comment-like-count {
        width: 40px;
        min-width: 40px;
        margin-right: 15px;
        align-items: center;
        display: flex;
        flex-direction: column;
    }

    .upvote {
        margin-bottom: 5px;
    }

    .downvote {
        margin-top: 5px;
    }

    .like-positive {
        color: var(--good-reputation-color);
    }

    .like-negative {
        color: var(--bad-reputation-color);
    }

    .comment-author-username {
        align-items: center;
        font-size: 16px;
        font-weight: bold;
        color: var(--main-text-color);
        cursor: pointer;
    }

    .comment-author-username img {
        margin-left: 5px;
        margin-right: 2px;
    }

    .comment-author-date {
        align-items: center;
        font-size: 12px;
        color: var(--secondary-text-color);
        margin-left: 10px;
    }

    .comment-action-btn {
        background: transparent;
        border: none;
        font-size: 14px;
        cursor: pointer;
        margin-left: 6px;
        padding: 2px 4px;
        border-radius: 4px;
        opacity: 0.7;
        transition: opacity 0.2s ease;
    }

    .comment-action-btn:hover {
        opacity: 1;
    }

    .comment-edit-box {
        width: 100%;
        margin-top: 6px;
        background-color: var(--alt-background-color);
        padding: 8px;
        border-radius: 8px;
        border: 1px solid var(--rate-back-color);
    }

    .comment-edit-textarea {
        width: 100%;
        min-height: 60px;
        background-color: var(--background-color);
        color: var(--main-text-color);
        border: 1px solid var(--rate-back-color);
        border-radius: 6px;
        padding: 8px;
        font-size: 14px;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
    }

    .comment-edit-controls {
        margin-top: 8px;
        align-items: center;
    }

    .spoiler-checkbox {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--secondary-text-color);
        cursor: pointer;
    }

    .btn-save {
        background-color: var(--main-color, #e50914);
        color: #fff;
        border: none;
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: bold;
        cursor: pointer;
    }

    .btn-cancel {
        background: transparent;
        color: var(--secondary-text-color);
        border: none;
        padding: 6px 10px;
        font-size: 13px;
        cursor: pointer;
    }

    .btn-cancel:hover {
        color: var(--main-text-color);
    }
</style>
