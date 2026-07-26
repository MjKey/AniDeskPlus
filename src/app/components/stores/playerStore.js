import { writable } from 'svelte/store';

// --- Playback State Stores ---
export const videoElement = writable(null);
export const isPaused = writable(false);
export const isLoading = writable(true);
export const currentTimeStore = writable('0:00');
export const durationTimeStore = writable('0:00');
export const progressPercentStore = writable(0);
export const loadedPercentStore = writable(0);
export const currentEpisodeStore = writable(null);

// --- UI State Stores ---
export const isFullscreenStore = writable(false);
export const isHiddenStore = writable(false);
export const aspectRatioStore = writable('16:9');
export const volumePercentStore = writable(100);
export const transparentPercentStore = writable(50);
export const playbackRateStore = writable(1.0);

// --- Skip & Toast Stores ---
export const skipTimesStore = writable({ op: null, ed: null });
export const activeSkipTypeStore = writable(null);
export const skipToastMessageStore = writable(null);
export const resumeToastMessageStore = writable(null);
export const skipTimeStore = writable(85);

export default {
    videoElement,
    isPaused,
    isLoading,
    currentTimeStore,
    durationTimeStore,
    progressPercentStore,
    loadedPercentStore,
    currentEpisodeStore,
    isFullscreenStore,
    isHiddenStore,
    aspectRatioStore,
    volumePercentStore,
    transparentPercentStore,
    playbackRateStore,
    skipTimesStore,
    activeSkipTypeStore,
    skipToastMessageStore,
    resumeToastMessageStore,
    skipTimeStore,
};
