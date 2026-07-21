/**
 * SkipTimes service for retrieving OP/ED intervals from AniSkip & AniLiberty APIs.
 */

const cache = new Map();

/**
 * Clean anime title for search query.
 */
function cleanTitle(title) {
    if (!title) return '';
    return title
        .replace(/ season \d+/gi, '')
        .replace(/ \d+(st|nd|rd|th) season/gi, '')
        .replace(/\(.*\)/g, '')
        .replace(/\[.*\]/g, '')
        .trim();
}

/**
 * Resolve MAL ID via Shikimori API.
 */
async function getMalIdByTitle(title) {
    if (!title) return null;
    try {
        const query = encodeURIComponent(cleanTitle(title));
        const res = await fetch(`https://shikimori.one/api/animes?search=${query}&limit=1`);
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

/**
 * Fetch OP/ED intervals from AniLiberty / AniLibria V1 API.
 */
async function fetchAniLiberty(episodeId) {
    if (!episodeId) return null;
    try {
        const url = `https://aniliberty.top/api/v1/anime/releases/episodes/${episodeId}?include=opening%2Cending`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data) return null;

        const result = { op: null, ed: null };
        if (data.opening && typeof data.opening.start === 'number' && typeof data.opening.stop === 'number') {
            result.op = {
                start: data.opening.start,
                end: data.opening.stop,
            };
        }
        if (data.ending && typeof data.ending.start === 'number' && typeof data.ending.stop === 'number') {
            result.ed = {
                start: data.ending.start,
                end: data.ending.stop,
            };
        }
        return (result.op || result.ed) ? result : null;
    } catch (e) {
        console.warn('[SkipTimes] AniLiberty fetch error:', e);
        return null;
    }
}

/**
 * Main function to retrieve skip times for a given release and episode.
 * @param {Object} release Release object containing title_ru, title_original, etc.
 * @param {Object} episode Episode object containing position, id, name.
 * @param {string} currentSourceName Source name (e.g. 'Libria', 'Kodik', 'Sibnet')
 */
export async function getSkipTimes(release, episode, currentSourceName) {
    if (!release) return { op: null, ed: null };

    const epNum = episode?.position || parseInt(episode?.name?.match(/\d+/)?.[0] || '1', 10) || 1;
    const cacheKey = `${release.id || 'rel'}_ep${epNum}_id${episode?.id || ''}`;

    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    let result = null;

    // 1. Try AniLiberty if episode has an ID or source is Liberty
    if ((currentSourceName === 'Libria' || currentSourceName === 'Liberty') && episode?.id) {
        result = await fetchAniLiberty(episode.id);
    }

    // 2. Fallback to AniSkip
    if (!result || (!result.op && !result.ed)) {
        let malId = release.shikimori_id || release.mal_id || release.myanimelist_id;
        if (!malId) {
            const titleToSearch = release.title_original || release.title_ru;
            malId = await getMalIdByTitle(titleToSearch);
        }

        if (malId) {
            const aniSkipResult = await fetchAniSkip(malId, epNum);
            if (aniSkipResult) {
                result = aniSkipResult;
            }
        }
    }

    const finalResult = result || { op: null, ed: null };
    cache.set(cacheKey, finalResult);
    return finalResult;
}
