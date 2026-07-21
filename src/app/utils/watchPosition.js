/**
 * WatchPosition service for saving and retrieving playback progress per episode and release.
 */

const STORAGE_KEY = 'watchPositions';
const MAX_ENTRIES = 500;

function getStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        console.warn('[WatchPosition] Error reading storage:', e);
        return {};
    }
}

function setStorage(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('[WatchPosition] Error writing storage:', e);
    }
}

function getEpisodeNumber(episode) {
    if (!episode) return 1;
    if (typeof episode.position === 'number' && episode.position > 0) {
        return episode.position;
    }
    if (episode.name) {
        const match = episode.name.match(/\d+/);
        if (match) return parseInt(match[0], 10);
    }
    return 1;
}

function buildKey(releaseId, episode) {
    if (!releaseId) return null;
    const epNum = getEpisodeNumber(episode);
    return `${releaseId}_ep${epNum}`;
}

/**
 * Save current playback position for an episode.
 * @param {number|string} releaseId Release ID
 * @param {Object} episode Episode object (containing position, id, name)
 * @param {number} currentTime Current video time in seconds
 * @param {number} duration Total video duration in seconds
 */
export function savePosition(releaseId, episode, currentTime, duration) {
    if (!releaseId || !episode || !duration || duration <= 0 || isNaN(currentTime)) return;

    const key = buildKey(releaseId, episode);
    if (!key) return;

    const storage = getStorage();
    const percentage = (currentTime / duration) * 100;

    // If watched 93%+ of episode or within last 20 seconds, mark as completed
    const isCompleted = percentage >= 93 || (duration - currentTime) <= 20;

    // If less than 5 seconds and not completed, clear saved position
    if (currentTime < 5 && !isCompleted) {
        if (storage[key]) {
            delete storage[key];
            setStorage(storage);
        }
        return;
    }

    storage[key] = {
        releaseId,
        episodeNum: getEpisodeNumber(episode),
        episodeId: episode.id || null,
        time: isCompleted ? 0 : Number(currentTime.toFixed(1)),
        duration: Number(duration.toFixed(1)),
        percentage: isCompleted ? 100 : Number(percentage.toFixed(1)),
        completed: isCompleted,
        updatedAt: Date.now()
    };

    // Keep storage clean if entry count exceeds limit
    const keys = Object.keys(storage);
    if (keys.length > MAX_ENTRIES) {
        const sorted = keys.sort((a, b) => (storage[a]?.updatedAt || 0) - (storage[b]?.updatedAt || 0));
        while (sorted.length > MAX_ENTRIES) {
            const oldKey = sorted.shift();
            delete storage[oldKey];
        }
    }

    setStorage(storage);
}

/**
 * Retrieve saved playback position for an episode.
 * @param {number|string} releaseId Release ID
 * @param {Object} episode Episode object
 * @returns {Object|null} Position data object { time, duration, percentage, completed }
 */
export function getSavedPosition(releaseId, episode) {
    if (!releaseId || !episode) return null;
    const key = buildKey(releaseId, episode);
    if (!key) return null;

    const storage = getStorage();
    const item = storage[key];
    if (!item) return null;

    return item;
}

/**
 * Clear saved position for an episode.
 */
export function clearPosition(releaseId, episode) {
    if (!releaseId || !episode) return;
    const key = buildKey(releaseId, episode);
    if (!key) return;

    const storage = getStorage();
    if (storage[key]) {
        delete storage[key];
        setStorage(storage);
    }
}

/**
 * Get map of all watch positions for a specific release.
 * @param {number|string} releaseId Release ID
 * @returns {Map<number, Object>} Map of episodeNum -> position object
 */
export function getReleasePositions(releaseId) {
    if (!releaseId) return new Map();
    const storage = getStorage();
    const map = new Map();

    const prefix = `${releaseId}_ep`;
    for (const [key, value] of Object.entries(storage)) {
        if (key.startsWith(prefix) && value && value.episodeNum) {
            map.set(value.episodeNum, value);
        }
    }

    return map;
}
