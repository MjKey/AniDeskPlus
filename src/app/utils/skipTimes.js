/**
 * SkipTimes service for retrieving OP/ED intervals from AniSkip & AniLiberty APIs.
 */

const cache = new Map();

/**
 * Normalize common Russian title typos or variations.
 */
function normalizeRussianTitle(title) {
    if (!title) return '';
    return title
        .replace(/Хвост Фей/gi, 'Хвост Феи')
        .replace(/ТВ-(\d+)/gi, '$1 сезон')
        .replace(/ТВ(\d+)/gi, '$1 сезон')
        .trim();
}

/**
 * Clean anime title for search query fallback.
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
 * Resolve MAL ID via Shikimori API.
 */
async function getMalIdByTitle(title) {
    if (!title || !title.trim()) return null;
    try {
        const query = encodeURIComponent(title.trim());
        const res = await fetch(`https://shikimori.one/api/animes?search=${query}&limit=1`, {
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
 * @param {string} currentSourceName Source name (e.g. 'Libria', 'Kodik', 'Sibnet')
 */
export async function getSkipTimes(release, episode, currentSourceName) {
    if (!release) return { op: null, ed: null };

    const epNum = getEpisodeNumber(episode);
    const cacheKey = `${release.id || 'rel'}_ep${epNum}_src${currentSourceName || ''}_id${episode?.id || ''}`;

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

        if (!malId && release.title_original) {
            malId = await getMalIdByTitle(release.title_original);
        }
        if (!malId && release.title_ru) {
            malId = await getMalIdByTitle(normalizeRussianTitle(release.title_ru));
        }
        if (!malId && release.title_ru) {
            malId = await getMalIdByTitle(release.title_ru);
        }
        if (!malId) {
            const cleaned = cleanTitle(release.title_original || release.title_ru);
            if (cleaned) {
                malId = await getMalIdByTitle(cleaned);
            }
        }

        if (malId) {
            console.log(`[SkipTimes] Querying AniSkip for MAL ID ${malId}, Ep ${epNum}...`);
            const aniSkipResult = await fetchAniSkip(malId, epNum);
            if (aniSkipResult) {
                result = aniSkipResult;
                console.log(`[SkipTimes] Got AniSkip result:`, result);
            }
        } else {
            console.warn(`[SkipTimes] Could not resolve MAL ID for: "${release.title_ru || release.title_original}"`);
        }
    }

    const finalResult = result || { op: null, ed: null };
    cache.set(cacheKey, finalResult);
    return finalResult;
}
