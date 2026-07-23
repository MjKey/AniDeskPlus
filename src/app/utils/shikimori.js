/**
 * Shikimori Integration Module for AniDeskPlus
 * Uses official Shikimori GraphQL API & OAuth2 REST API
 */

const USER_AGENT = "AniDeskPlusApp/1.0 (Desktop; Windows)";

export const SHIKI_CLIENT_ID = __ENV_SHIKIMORI_CLIENT_ID__;
export const SHIKI_CLIENT_SECRET = __ENV_SHIKIMORI_CLIENT_SECRET__;
export const SHIKI_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

export const ShikimoriDomains = [
    { value: "shikimori.io", label: "shikimori.io (По умолчанию)" },
    { value: "shikimori.me", label: "shikimori.me" },
    { value: "shikimori.one", label: "shikimori.one" }
];

export function getShikimoriDomain() {
    return localStorage.getItem("shikimori_domain") || "shikimori.io";
}

export function setShikimoriDomain(domain) {
    if (domain) {
        localStorage.setItem("shikimori_domain", domain);
    }
}

function getShikimoriBaseUrl() {
    return `https://${getShikimoriDomain()}/api`;
}

function getShikimoriGraphQlUrl() {
    return `https://${getShikimoriDomain()}/api/graphql`;
}

function getShikimoriOAuthTokenUrl() {
    return `https://${getShikimoriDomain()}/oauth/token`;
}

export function getShikimoriAuthUrl() {
    return `https://${getShikimoriDomain()}/oauth/authorize?client_id=${SHIKI_CLIENT_ID}&redirect_uri=${encodeURIComponent(SHIKI_REDIRECT_URI)}&response_type=code&scope=user_rates`;
}

export async function exchangeShikimoriCode(authCode) {
    if (!authCode) return null;
    try {
        const res = await fetch(getShikimoriOAuthTokenUrl(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT
            },
            body: JSON.stringify({
                grant_type: "authorization_code",
                client_id: SHIKI_CLIENT_ID,
                client_secret: SHIKI_CLIENT_SECRET,
                code: authCode.trim(),
                redirect_uri: SHIKI_REDIRECT_URI
            })
        });

        if (!res.ok) {
            console.error("[Shikimori OAuth] Token exchange failed:", res.status);
            return null;
        }

        const data = await res.json();
        return data; // { access_token, refresh_token, token_type, scope, created_at }
    } catch (e) {
        console.error("[Shikimori OAuth] Exchange error:", e);
        return null;
    }
}

function getCache(key) {
    try {
        const item = localStorage.getItem(`shiki_cache_${key}`);
        if (!item) return null;
        const data = JSON.parse(item);
        if (Date.now() - data.time > 86400000) return null; // 24h cache
        return data.val;
    } catch (e) {
        return null;
    }
}

function setCache(key, val) {
    try {
        localStorage.setItem(`shiki_cache_${key}`, JSON.stringify({
            time: Date.now(),
            val
        }));
    } catch (e) {}
}

export const ShikimoriStatuses = [
    { value: "watching", label: "Смотрю" },
    { value: "planned", label: "В планах" },
    { value: "completed", label: "Просмотрено" },
    { value: "rewatching", label: "Пересматриваю" },
    { value: "on_hold", label: "Отложено" },
    { value: "dropped", label: "Брошено" }
];

export async function searchShikimoriAnimeGraphQL(titleOriginal, titleRu, token = null) {
    const queryStr = titleOriginal || titleRu;
    if (!queryStr) return null;

    const cacheKey = `gql_search_${queryStr}_${Boolean(token)}_${getShikimoriDomain()}`;
    const cached = getCache(cacheKey);
    if (cached !== null) return cached;

    const gqlQuery = `
        query SearchAnime($search: String!) {
            animes(search: $search, limit: 1) {
                id
                name
                russian
                score
                status
                episodes
                episodesAired
                userRate {
                    id
                    status
                    episodes
                    score
                }
            }
        }
    `;

    try {
        const headers = {
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT
        };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(getShikimoriGraphQlUrl(), {
            method: "POST",
            headers,
            body: JSON.stringify({
                query: gqlQuery,
                variables: { search: queryStr }
            })
        });

        if (!res.ok) return null;
        const result = await res.json();
        const anime = result?.data?.animes?.[0] || null;
        if (anime) {
            setCache(cacheKey, anime);
            return anime;
        }
    } catch (e) {
        console.error("[Shikimori GraphQL] Search error:", e);
    }
    return null;
}

export async function getShikimoriWhoAmI(token) {
    if (!token) return null;
    try {
        const res = await fetch(`${getShikimoriBaseUrl()}/users/whoami`, {
            headers: {
                "User-Agent": USER_AGENT,
                "Authorization": `Bearer ${token}`
            }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error("[Shikimori] WhoAmI error:", e);
        return null;
    }
}

export async function getShikimoriUserRate(shikiAnimeId, token, userId) {
    if (!token || !userId || !shikiAnimeId) return null;
    try {
        const url = `${getShikimoriBaseUrl()}/v2/user_rates?user_id=${userId}&target_id=${shikiAnimeId}&target_type=Anime`;
        const res = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Authorization": `Bearer ${token}`
            }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            return data[0];
        }
    } catch (e) {
        console.error("[Shikimori v2] Get user rate error:", e);
    }
    return null;
}

export async function saveShikimoriUserRate(shikiAnimeId, token, userId, status, episodes, existingRateId = null) {
    if (!token || !userId || !shikiAnimeId) return null;

    try {
        const isUpdate = Boolean(existingRateId);
        const url = isUpdate 
            ? `${getShikimoriBaseUrl()}/v2/user_rates/${existingRateId}`
            : `${getShikimoriBaseUrl()}/v2/user_rates`;

        const method = isUpdate ? "PATCH" : "POST";
        const body = JSON.stringify({
            user_rate: {
                user_id: userId,
                target_id: shikiAnimeId,
                target_type: "Anime",
                status: status || "watching",
                episodes: Number(episodes) || 0
            }
        });

        const res = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
                "Authorization": `Bearer ${token}`
            },
            body
        });

        if (!res.ok) {
            console.error("[Shikimori v2] Save user rate response error:", res.status);
            return null;
        }

        return await res.json();
    } catch (e) {
        console.error("[Shikimori v2] Save user rate error:", e);
        return null;
    }
}
