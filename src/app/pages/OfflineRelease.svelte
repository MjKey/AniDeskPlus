<script>
    import AnimePoster from "../components/release/AnimePoster.svelte";
    import LeftReleaseBaseButton from "../components/buttons/LeftReleaseBaseButton.svelte";
    import MetaInfo from "../components/gui/MetaInfo.svelte";
    import PlayIcon from "../icons/play.svg";
    import { downloadProgressStore } from "../components/stores/downloadProgressStore";

    export let args;

    $: progresses = $downloadProgressStore;

    let isNavigating = false;

    function playEpisode(ep) {
        if (isNavigating) return;
        isNavigating = true;

        const hexPath = Array.from(new TextEncoder().encode(ep.filePath)).map(b => b.toString(16).padStart(2, '0')).join('');
        const offlineUrl = `anixflow://${hexPath}`;

        const mockSource = { id: 0, name: 'Offline', type: { id: 0, name: 'Оффлайн' }, '@id': 0 };
        const episodesMock = (args.anime.episodes || []).map(e => ({
            position: e.id,
            name: e.title,
            source: mockSource,
            url: offlineUrl
        }));
        const currentEpisodeMock = {
            position: ep.id,
            name: ep.title,
            source: mockSource,
            url: offlineUrl
        };
        
        updateViewportComponent(11, {
            src: offlineUrl,
            currentQuality: 720,
            avaliableQuality: { "720": { src: offlineUrl } },
            release: { ...args.anime, title_ru: args.anime.title_ru || args.anime.title || 'Аниме' },
            episodes: episodesMock,
            currentEpisode: currentEpisodeMock,
            isOffline: true
        });
    }

    async function deleteEpisode(ep) {
        if (confirm("Вы действительно хотите удалить эту скачанную серию?")) {
            await offlineApi.deleteEpisode(args.anime.id, ep.id);
            downloadProgressStore.update(s => { delete s[`${args.anime.id}_${ep.id}`]; return { ...s }; });
            args.anime.episodes = args.anime.episodes.filter(e => e.id !== ep.id);
            if (args.anime.episodes.length === 0) {
                updateViewportComponent(13);
            }
        }
    }
</script>

<MetaInfo subTitle={args.anime.title_ru} />

<div class="release-container container flex-row">
    <div class="left-content flex-column">
        <span class="release-title text-title">{args.anime.title_ru}</span>
        <div class="poster-container">
            <AnimePoster
                size={{ width: 387, height: 550 }}
                posterInfo={{
                    poster: args.anime.image,
                    title: args.anime.title_ru,
                }}
                shadow={true} 
                borderRadius={20}
            />
        </div>
        <div class="buttons-container flex-column">
            {#if args.anime.episodes && args.anime.episodes.length > 0}
                <LeftReleaseBaseButton
                    icon={PlayIcon}
                    title="Воспроизвести"
                    backgroundColor="var(--select-button-color)"
                    hoverColor="var(--select-button-left-color)"
                    onClickCallback={() => playEpisode(args.anime.episodes[0])}
                />
            {/if}
            <LeftReleaseBaseButton
                title="Назад к загрузкам"
                backgroundColor="var(--alt-background-color)"
                hoverColor="var(--background-color)"
                onClickCallback={() => updateViewportComponent(13)}
            />
        </div>
    </div>
    
    <div class="right-content flex-column" tabindex="-1">
        <div class="right-top-bar flex-row">
            <span class="release-title-right text-title">{args.anime.title_ru || args.anime.title}</span>
            <div class="tag-list flex-row text-title">
                <span class="tag age-rate">Офлайн</span>
            </div>
        </div>

        <div class="episodes-list">
            {#if args.anime.episodes && args.anime.episodes.length > 0}
                {#each args.anime.episodes as ep}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="base-card" onclick={() => playEpisode(ep)}>
                        <div class="base-card-name">
                            {ep.title}
                        </div>
                        <div class="right-menu flex-row">
                            <button class="download-btn" onclick={(e) => { e.stopPropagation(); deleteEpisode(ep); }} title="Удалить">
                                <span style="color: #4CAF50; font-size: 14px; font-weight: bold; margin-right: 5px;">Скачано</span>
                                <img src="./assets/icons/checkmark.svg" alt="check" />
                            </button>
                        </div>
                    </div>
                {/each}
            {:else}
                <div class="empty-state">Нет скачанных серий</div>
            {/if}
        </div>
    </div>
</div>

<style>
    .release-container {
        padding-top: 35px;
        padding-left: 20px;
        padding-bottom: 20px;
        width: calc(100vw - 110px);
        max-width: 1450px;
    }

    .left-content {
        margin-right: 35px;
        width: 387px;
        height: 100%;
        min-width: 387px;
    }

    .poster-container {
        border-radius: 20px;
        overflow: hidden;
    }

    .buttons-container {
        margin-top: 15px;
        gap: 15px;
    }

    .right-content {
        height: 100%;
        width: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        padding-right: 20px;
    }

    .right-top-bar {
        align-items: center;
        justify-content: space-between;
        margin-bottom: 15px;
    }

    .release-title-right {
        font-size: 26px;
        max-width: 70%;
        line-height: 1.2;
        white-space: normal;
    }

    .release-title {
        font-size: 28px;
        max-width: 100%;
        margin-bottom: 15px;
        line-height: 1.2;
    }

    .tag-list {
        gap: 10px;
    }

    .tag {
        padding: 5px 15px;
        border-radius: 10px;
        font-size: 16px;
        background-color: var(--alt-background-color);
        white-space: nowrap;
    }

    .episodes-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 20px;
    }

    .base-card {
        height: 50px;
        width: 100%;
        border-radius: 10px;
        background-color: var(--alt-background-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-left: 15px;
        padding-right: 15px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .base-card:hover {
        background-color: var(--select-button-color);
    }

    .base-card-name {
        font-size: 16px;
        color: var(--main-text-color);
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .right-menu {
        align-items: center;
        gap: 15px;
    }

    .download-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        opacity: 0.8;
        transition: opacity 0.2s;
    }

    .download-btn:hover {
        opacity: 1;
    }

    .empty-state {
        color: var(--third-text-color);
        font-size: 18px;
        text-align: center;
        margin-top: 50px;
    }
</style>
