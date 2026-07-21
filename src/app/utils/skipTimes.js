/**
 * SkipTimes service for retrieving OP/ED intervals from AniSkip API.
 */

const cache = new Map();

/**
 * Clean anime title for search query fallback (removes brackets, extra spaces, etc.).
 */
function cleanTitle(title) {
    if (!title) return '';
    return title
        .replace(/\d+\s*(сезон|season|часть|part)/gi, '')
        .replace(/(сезон|season|часть|part)\s*\d+/gi, '')
        .replace(/\(.*\)/g, '')
        .replace(/\[.*\]/g, '')
        .trim();
}

/**
 * Search Shikimori API for a given query string.
 */
async function searchShikimori(query) {
    if (!query || !query.trim()) return null;
    try {
        const url = `https://shikimori.one/api/animes?search=${encodeURIComponent(query.trim())}&limit=5`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AniDeskPlus/1.0' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].id) {
            return data[0].id;
        }
    } catch (e) {
        console.warn('[SkipTimes] Shikimori lookup error:', e);
    }
    return null;
}

/**
 * Resolve MAL ID via direct IDs or search cascade.
 */
async function resolveMalId(release) {
    if (!release) return null;

    let malId = release.shikimori_id || release.mal_id || release.myanimelist_id;
    if (malId) return malId;

    // 1. Try original title first (e.g. "Fairy Tail", "Shingeki no Kyojin Season 2")
    if (release.title_original) {
        malId = await searchShikimori(release.title_original);
        if (malId) return malId;
    }

    // 2. Try raw Russian title (e.g. "Хвост Фей", "Атака титанов 2 сезон")
    if (release.title_ru) {
        malId = await searchShikimori(release.title_ru);
        if (malId) return malId;
    }

    // 3. Try cleaned original title
    if (release.title_original) {
        const cleaned = cleanTitle(release.title_original);
        if (cleaned && cleaned !== release.title_original) {
            malId = await searchShikimori(cleaned);
            if (malId) return malId;
        }
    }

    // 4. Try cleaned Russian title
    if (release.title_ru) {
        const cleaned = cleanTitle(release.title_ru);
        if (cleaned && cleaned !== release.title_ru) {
            malId = await searchShikimori(cleaned);
            if (malId) return malId;
        }
    }

    return null;
}

/**
 * Fetch OP/ED intervals from AniSkip API V2.
 */
async function fetchAniSkip(malId, episodeNum) {
    if (!malId || episodeNum == null) return null;
    try {
        const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNum}?types=op&types=ed&episodeLength=0`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.found || !Array.isArray(data.results)) return null;

        const result = { op: null, ed: null };
        for (const item of data.results) {
            if (item.skipType === 'op' && item.interval) {
                result.op = {
                    start: Number(item.interval.startTime),
                    end: Number(item.interval.endTime),
                };
            } else if (item.skipType === 'ed' && item.interval) {
                result.ed = {
                    start: Number(item.interval.startTime),
                    end: Number(item.interval.endTime),
                };
            }
        }
        return result;
    } catch (e) {
        console.warn('[SkipTimes] AniSkip fetch error:', e);
        return null;
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

/**
 * Main function to retrieve skip times for a given release and episode.
 * @param {Object} release Release object containing title_ru, title_original, etc.
 * @param {Object} episode Episode object containing position, id, name.
 * @param {string} currentSourceName Source name
 */
export async function getSkipTimes(release, episode, currentSourceName) {
    if (!release) return { op: null, ed: null };

    const epNum = getEpisodeNumber(episode);
    const cacheKey = `${release.id || 'rel'}_ep${epNum}_src${currentSourceName || ''}_id${episode?.id || ''}`;

    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    let result = null;
    const malId = await resolveMalId(release);

    if (malId) {
        console.log(`[SkipTimes] Querying AniSkip for MAL ID ${malId}, Ep ${epNum}...`);
        result = await fetchAniSkip(malId, epNum);
        if (result) {
            console.log(`[SkipTimes] Got AniSkip result:`, result);
        }
    } else {
        console.warn(`[SkipTimes] Could not resolve MAL ID for: "${release.title_ru || release.title_original}"`);
    }

    const finalResult = result || { op: null, ed: null };
    cache.set(cacheKey, finalResult);
    return finalResult;
}
