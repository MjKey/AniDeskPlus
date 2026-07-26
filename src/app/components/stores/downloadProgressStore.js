import { writable } from 'svelte/store';

// Maps downloadId (animeId_episodeId) to percent (0-100, -1 error, -2 queued)
export const downloadProgressStore = writable({});

if (typeof window !== 'undefined' && window.offlineApi) {
    window.offlineApi.getLibrary().then(library => {
        if (Array.isArray(library)) {
            downloadProgressStore.update(store => {
                for (const anime of library) {
                    if (anime.episodes) {
                        for (const ep of anime.episodes) {
                            store[`${anime.id}_${ep.id}`] = 100;
                        }
                    }
                }
                return store;
            });
        }
    }).catch(() => {});

    window.offlineApi.onProgress((data) => {
        if (!data) return;
        downloadProgressStore.update(store => {
            const id = `${data.animeId}_${data.episodeId}`;
            if (data.percent === -1) {
                delete store[id]; // Cancelled
            } else {
                store[id] = data.percent;
            }
            return { ...store };
        });
    });

    window.offlineApi.onError((data) => {
        if (!data) return;
        downloadProgressStore.update(store => {
            const id = `${data.animeId}_${data.episodeId}`;
            store[id] = -1; // Indicates error
            return { ...store };
        });
    });
}
