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

function parseKodikSkipString(skipString) {
    const result = { op: null, ed: null };
    if (!skipString) return result;
    
    const parts = skipString.split(',');
    
    function parseTime(timeStr) {
        const p = timeStr.trim().split(':');
        if (p.length === 2) {
            return parseInt(p[0]) * 60 + parseInt(p[1]);
        }
        if (p.length === 3) {
            return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseInt(p[2]);
        }
        return 0;
    }
    
    if (parts.length >= 1) {
        const opParts = parts[0].split('-');
        if (opParts.length === 2) {
            result.op = {
                start: parseTime(opParts[0]),
                end: parseTime(opParts[1])
            };
        }
    }
    if (parts.length >= 2) {
        const edParts = parts[1].split('-');
        if (edParts.length === 2) {
            result.ed = {
                start: parseTime(edParts[0]),
                end: parseTime(edParts[1])
            };
        }
    }
    
    return result;
}

async function getKodikSkipTimes(episodeUrl) {
    if (!episodeUrl) return null;
    try {
        const url = URL.canParse(episodeUrl) ? episodeUrl : `https:${episodeUrl}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!res.ok) return null;
        
        const html = await res.text();
        const regex = /playerSettings\.skipButton\s*=\s*parseSkipButton\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/;
        const match = html.match(regex);
        
        if (match) {
            const skipString = match[1];
            return parseKodikSkipString(skipString); 
        }
    } catch (e) {
        console.warn("[SkipTimes] Kodik skip parse error:", e);
    }
    return null;
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
    if (!release) return { op: null, ed: null, fromKodik: false, kodikMissing: false };

    const epNum = getEpisodeNumber(episode);
    const cacheKey = `${release.id || 'rel'}_ep${epNum}_src${currentSourceName || ''}_id${episode?.id || ''}`;

    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    let kodikChecked = false;
    let kodikFound = false;

    if (currentSourceName === "Kodik" && episode?.url) {
        kodikChecked = true;
        console.log(`[SkipTimes] Querying Kodik HTML for skip times...`);
        const kodikTimes = await getKodikSkipTimes(episode.url);
        if (kodikTimes && (kodikTimes.op || kodikTimes.ed)) {
            console.log(`[SkipTimes] Got exact skip times from Kodik HTML:`, kodikTimes);
            const finalResult = { ...kodikTimes, fromKodik: true, kodikMissing: false };
            cache.set(cacheKey, finalResult);
            return finalResult;
        }
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

    const finalResult = {
        op: result?.op || null,
        ed: result?.ed || null,
        fromKodik: false,
        kodikMissing: kodikChecked
    };
    cache.set(cacheKey, finalResult);
    return finalResult;
}
