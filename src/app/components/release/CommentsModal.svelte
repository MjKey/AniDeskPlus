<script>
    import AuthPlaceholder from "../../pages/AuthPlaceholder.svelte";
    import CommentItem from "../elements/CommentItem.svelte";
    import NotAvailable from "../../pages/NotAvailable.svelte";
    import Preloader from "../gui/Preloader.svelte";
    import { createEventDispatcher } from "svelte";

    const dispatch = createEventDispatcher();

    export let args;
    export let showed;
    dispatch("setTitle", "Комментарии");

    let page = 0;
    let allData = [];
    let newComments = [];
    let firstData = anixApi.release.getComments({ id: args.id, page, sort: 0 });

    let updateInfo = false;
    let commentMessage = "";
    let isSpoiler = false;
    let isSending = false;
    let replyToTarget = null;
    let errorMessage = null;

    async function getCommentPage() {
        const data = await anixApi.release.getComments({ id: args.id, page, sort: 0 });
        allData = allData.concat(data.content);
        updateInfo = false;
    }

    async function scrollEvent(e) {
        const target = e.target || e.currentTarget;
        if (target && target.scrollTop >= target.scrollHeight - 2000 && !updateInfo) {
            updateInfo = true;
            page++;
            await getCommentPage();
        }
    }

    async function sendComment() {
        if (!commentMessage.trim() || isSending) return;
        if (!anixApi.client.token) {
            dispatch("updateComponent", AuthPlaceholder);
            return;
        }

        isSending = true;
        errorMessage = null;

        try {
            const payload = {
                message: commentMessage.trim(),
                spoiler: isSpoiler,
                parentCommentId: replyToTarget ? replyToTarget.id : null,
                replyToProfileId: replyToTarget ? replyToTarget.profile.id : null,
            };

            const res = await anixApi.release.addComment(args.id, payload);
            if (res.code === 0) {
                commentMessage = "";
                isSpoiler = false;
                replyToTarget = null;
                // Перезапросим первую страницу для актуальных комментариев
                firstData = anixApi.release.getComments({ id: args.id, page: 0, sort: 0 });
            } else {
                errorMessage = res.message || "Не удалось отправить комментарий";
            }
        } catch (e) {
            errorMessage = e.message || "Ошибка при отправке комментария";
        } finally {
            isSending = false;
        }
    }

    function handleReply(comment) {
        replyToTarget = comment;
    }

    function handleDeleteComment(commentId) {
        newComments = newComments.filter((c) => c.id !== commentId);
        allData = allData.filter((c) => c.id !== commentId);
        firstData = firstData.then((d) => {
            return {
                ...d,
                content: d.content.filter((c) => c.id !== commentId),
            };
        });
    }
</script>

{#if showed}
    <div class="modal-title">Комментарии</div>

    {#if anixApi.client.token}
        <div class="comment-input-container flex-column">
            {#if replyToTarget}
                <div class="reply-target-bar flex-row">
                    <span>Ответ для <b>@{replyToTarget.profile.login}</b></span>
                    <button class="cancel-reply-btn" onclick={() => (replyToTarget = null)}>✕</button>
                </div>
            {/if}

            {#if errorMessage}
                <div class="comment-error-banner">{errorMessage}</div>
            {/if}

            <textarea
                class="comment-textarea"
                placeholder={replyToTarget ? `Ваш ответ для @${replyToTarget.profile.login}...` : "Написать комментарий..."}
                bind:value={commentMessage}
            ></textarea>

            <div class="comment-input-footer flex-row">
                <label class="spoiler-label flex-row">
                    <input type="checkbox" bind:checked={isSpoiler} />
                    <span>Спойлер</span>
                </label>
                <button
                    class="send-comment-btn"
                    disabled={!commentMessage.trim() || isSending}
                    onclick={sendComment}
                >
                    {isSending ? "Отправка..." : "Отправить"}
                </button>
            </div>
        </div>
    {:else}
        <div class="auth-notice" onclick={() => dispatch("updateComponent", AuthPlaceholder)}>
            Войдите в аккаунт, чтобы оставлять комментарии
        </div>
    {/if}

    {#await firstData}
        <div class="center">
            <Preloader />
        </div>
    {:then i}
        <div class="modal-content" onscroll={scrollEvent}>
            {#each i.content as d (d.id)}
                {#if d.parent_comment_id === null}
                    <CommentItem
                        comment={d}
                        on:reply={(e) => handleReply(e.detail)}
                        on:deleteComment={(e) => handleDeleteComment(e.detail)}
                        on:showAuthModal={() => dispatch("updateComponent", AuthPlaceholder)}
                        on:notAvailable={() => dispatch("updateComponent", NotAvailable)}
                    />
                {/if}
            {/each}
            {#each allData as d (d.id)}
                {#if d.parent_comment_id === null}
                    <CommentItem
                        comment={d}
                        on:reply={(e) => handleReply(e.detail)}
                        on:deleteComment={(e) => handleDeleteComment(e.detail)}
                        on:showAuthModal={() => dispatch("updateComponent", AuthPlaceholder)}
                        on:notAvailable={() => dispatch("updateComponent", NotAvailable)}
                    />
                {/if}
            {/each}
        </div>
    {/await}
{/if}

<style>
    .center {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
    }

    .comment-input-container {
        margin: 10px 15px;
        padding: 12px;
        background-color: var(--alt-background-color);
        border-radius: 10px;
        border: 1px solid var(--rate-back-color);
    }

    .reply-target-bar {
        justify-content: space-between;
        align-items: center;
        background-color: var(--background-color);
        padding: 6px 12px;
        border-radius: 6px;
        margin-bottom: 8px;
        font-size: 13px;
        color: var(--main-text-color);
    }

    .cancel-reply-btn {
        background: transparent;
        border: none;
        color: var(--secondary-text-color);
        cursor: pointer;
        font-size: 14px;
    }

    .cancel-reply-btn:hover {
        color: var(--main-text-color);
    }

    .comment-textarea {
        width: 100%;
        min-height: 60px;
        max-height: 120px;
        background-color: var(--background-color);
        color: var(--main-text-color);
        border: 1px solid var(--rate-back-color);
        border-radius: 8px;
        padding: 10px;
        font-size: 14px;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
    }

    .comment-textarea:focus {
        border-color: var(--main-color);
    }

    .comment-input-footer {
        justify-content: space-between;
        align-items: center;
        margin-top: 10px;
    }

    .spoiler-label {
        gap: 6px;
        font-size: 13px;
        color: var(--secondary-text-color);
        cursor: pointer;
        align-items: center;
    }

    .send-comment-btn {
        background-color: var(--main-color, #e50914);
        color: #fff;
        border: none;
        padding: 8px 18px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        transition: opacity 0.2s ease;
    }

    .send-comment-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .auth-notice {
        margin: 10px 15px;
        padding: 12px;
        background-color: var(--alt-background-color);
        border-radius: 8px;
        text-align: center;
        color: var(--main-color);
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
    }

    .comment-error-banner {
        background-color: var(--danger-color);
        color: #fff;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 13px;
        margin-bottom: 8px;
    }
</style>
