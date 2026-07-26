<script>
    import AnimeColumnCard from "../components/elements/AnimeColumnCard.svelte";
    import MetaInfo from "../components/gui/MetaInfo.svelte";
    import Preloader from "../components/gui/Preloader.svelte";
    import utils from "../utils";
    import OfflineRelease from "./OfflineRelease.svelte";

    import { onMount } from "svelte";
    import { downloadProgressStore } from "../components/stores/downloadProgressStore";

    let library = offlineApi.getLibrary();
    let activeDownloads = [];
    $: progresses = $downloadProgressStore;

    onMount(async () => {
        activeDownloads = await offlineApi.getActiveDownloads();
    });

    function openFolder() {
        offlineApi.openFolder();
    }
    
    $: activeAnime = Object.values(activeDownloads.reduce((acc, d) => {
        if (!acc[d.animeMeta.id]) {
            acc[d.animeMeta.id] = { ...d.animeMeta, episodes_count: 0, activeEpId: d.episodeMeta.id, downloadId: d.downloadId };
        }
        return acc;
    }, {}));

</script>

<MetaInfo subTitle="Загрузки" />

<div class="releases-type flex-row" tabindex="-1">
    <button class="releases-type-title flex-column selected">Скачанное</button>
</div>
<div tabindex="-1" class="releases-container flex-column">
    <div class="flex-row releases-title">
        <span>Загруженные видео для офлайн просмотра</span>
        <button class="open-folder-btn" onclick={openFolder}>Открыть папку</button>
    </div>
    {#await library}
        <Preloader />
    {:then Releases}
        {#if Releases.length === 0 && activeAnime.length === 0}
            <div class="empty-state">У вас пока нет скачанных серий.</div>
        {:else}
            <div class="cards-grid">
                {#each activeAnime as anime}
                    {@const p = progresses[anime.downloadId] ?? anime.percent ?? 0}
                    {@const libAnime = Releases.find(r => r.id === anime.id)}
                    <AnimeColumnCard 
                        onClickOverride={() => updateViewportComponent(OfflineRelease, { anime: { id: anime.id, title_ru: anime.title_ru || anime.title || anime.name, image: anime.image, episodes: libAnime?.episodes || [] } })}
                        anime={{
                        id: anime.id,
                        title_ru: anime.title_ru || anime.title || anime.name || 'Загрузка...',
                        image: anime.image,
                        episodes_released: libAnime?.episodes?.length || 0,
                        episodes_total: libAnime?.episodes?.length || 0,
                        grade: anime.grade ?? null,
                        status: anime.status ?? null,
                        profile_list_status: anime.profile_list_status ?? 0
                    }}>
                        <div style="color: #4CAF50; font-size: 13px; margin-top: -5px; margin-bottom: 5px; font-weight: bold; display: flex; align-items: center;">
                            Загрузка: {Math.round(p)}%
                        </div>
                    </AnimeColumnCard>
                {/each}
                {#each Releases.filter(r => !activeAnime.find(a => a.id === r.id)) as Release}
                    <AnimeColumnCard 
                        onClickOverride={() => updateViewportComponent(OfflineRelease, { anime: Release })}
                        anime={{
                        id: Release.id,
                        title_ru: Release.title_ru || Release.title || Release.name || 'Без названия',
                        image: Release.image,
                        episodes_released: Release.episodes?.length || 0,
                        episodes_total: Release.episodes?.length || 0,
                        grade: Release.grade ?? null,
                        status: Release.status ?? null,
                        profile_list_status: Release.profile_list_status ?? 0
                    }} />
                {/each}
            </div>
        {/if}
    {/await}
</div>

<style>
    .empty-state {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        color: var(--third-text-color);
        font-size: 16px;
    }

    .open-folder-btn {
        background-color: var(--select-button-color);
        color: var(--main-text-color);
        border: none;
        padding: 5px 15px;
        border-radius: 8px;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .open-folder-btn:hover {
        background-color: var(--select-button-left-color);
    }

    .cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 20px;
        padding: 20px;
    }

    .releases-container {
        width: 100%;
        height: 100%;
        overflow-y: auto;
    }

    .releases-title {
        margin-top: var(--margin-title, 16px);
        margin-left: 23px;
        margin-right: 23px;
        justify-content: space-between;
        align-items: center;
    }

    .releases-type {
        width: 100%;
        height: 50px;
        justify-content: center;
        align-items: center;
        position: sticky;
        top: 0;
        background-color: var(--background-color);
        z-index: 1;
    }

    .releases-type-title {
        margin-right: auto;
        height: 100%;
        padding-left: 20px;
        padding-right: 20px;
        font-size: 16px !important;
        display: flex;
        justify-content: center;
        align-items: center;
        color: var(--third-text-color);
        transition: all 0.3s ease;
        font-weight: 400;
        position: relative;
    }

    .releases-type-title:hover {
        cursor: pointer;
        background-color: var(--alt-background-color);
    }

    .selected {
        font-weight: bold;
        color: var(--main-text-color);
    }

    .selected:hover {
        background-color: var(--background-color);
        cursor: default;
    }

    .selected::after {
        content: "";
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 2px;
        background-color: var(--main-text-color);
        animation: line-grow 0.5s cubic-bezier(0.55, 0, 0.1, 1) forwards;
    }

    @keyframes line-grow {
        0% {
            width: 0;
            left: 50%;
        }
        100% {
            width: 100%;
            left: 0;
        }
    }
</style>
