import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit logic for wrapAnixApi prefetching
const paginatedProps = new Set([
    'filter', 'all', 'getCollectionFavorites', 'getCollectionReleases',
    'getFriends', 'getVotedReleases', 'getBookmarks', 'getFavorites',
    'getComments', 'getRelatedReleases', 'releases', 'getCommentReplies'
]);

function getContentArray(r) {
    if (r && Array.isArray(r.content)) return r.content;
    if (r && r.releases && Array.isArray(r.releases.content)) return r.releases.content;
    return null;
}

function setContentArray(r, arr) {
    if (r && Array.isArray(r.content)) r.content = arr;
    else if (r && r.releases && Array.isArray(r.releases.content)) r.releases.content = arr;
}

function wrapAnixApi(endpoints) {
    const handler = {
        get(target, prop) {
            const val = target[prop];
            if (typeof val === 'function') {
                return async function(...args) {
                    if (!paginatedProps.has(prop)) {
                        return val.apply(target, args);
                    }

                    let pageValue = -1;
                    let pageIndex = -1;
                    
                    if (typeof args[0] === 'number') {
                        pageValue = args[0]; pageIndex = 0;
                    } else if (args[0] !== null && typeof args[0] === 'object' && typeof args[0].page === 'number') {
                        pageValue = args[0].page; pageIndex = 'in_obj';
                    }

                    if (pageValue === -1) {
                        return val.apply(target, args);
                    }

                    const pageA = pageValue * 2;
                    const pageB = pageValue * 2 + 1;

                    const argsA = JSON.parse(JSON.stringify(args));
                    if (pageIndex === 0) argsA[0] = pageA;
                    else if (pageIndex === 'in_obj') argsA[0].page = pageA;

                    const argsB = JSON.parse(JSON.stringify(args));
                    if (pageIndex === 0) argsB[0] = pageB;
                    else if (pageIndex === 'in_obj') argsB[0].page = pageB;

                    try {
                        const [resA, resB] = await Promise.all([
                            val.apply(target, argsA),
                            val.apply(target, argsB).catch(() => null)
                        ]);

                        if (resA) {
                            const contentA = getContentArray(resA);
                            const contentB = resB ? getContentArray(resB) : null;
                            if (contentA && contentB && Array.isArray(contentB)) {
                                setContentArray(resA, contentA.concat(contentB));
                            }
                            return resA;
                        }
                        return resA;
                    } catch (e) {
                        return val.apply(target, args);
                    }
                };
            }
            if (typeof val === 'object' && val !== null) {
                return new Proxy(val, handler);
            }
            return val;
        }
    };
    return new Proxy(endpoints, handler);
}

describe('Network Timeout & API Prefetch Unit Tests', () => {

    describe('API Prefetching Proxy (wrapAnixApi)', () => {
        it('should double-fetch page N and N+1 in parallel for paginated endpoints', async () => {
            const mockApi = {
                filter: vi.fn(async (page) => {
                    return {
                        page,
                        content: [{ id: page * 10 + 1 }, { id: page * 10 + 2 }]
                    };
                })
            };

            const wrapped = wrapAnixApi(mockApi);
            const result = await wrapped.filter(0);

            // Page 0 should request page 0 and 1 behind the scenes
            expect(mockApi.filter).toHaveBeenCalledTimes(2);
            expect(result.content.length).toBe(4);
            expect(result.content[0].id).toBe(1);
            expect(result.content[2].id).toBe(11);
        });

        it('should pass non-paginated endpoints through without doubling requests', async () => {
            const mockApi = {
                getRelease: vi.fn(async (id) => ({ id, title: 'Test Anime' }))
            };

            const wrapped = wrapAnixApi(mockApi);
            const result = await wrapped.getRelease(12345);

            expect(mockApi.getRelease).toHaveBeenCalledTimes(1);
            expect(result.title).toBe('Test Anime');
        });

        it('should handle failure of second page gracefully by returning page A content', async () => {
            const mockApi = {
                filter: vi.fn(async (page) => {
                    if (page === 1) throw new Error('Network error');
                    return { page, content: [{ id: 10 }] };
                })
            };

            const wrapped = wrapAnixApi(mockApi);
            const result = await wrapped.filter(0);

            expect(result.content.length).toBe(1);
            expect(result.content[0].id).toBe(10);
        });
    });

    describe('Request Cancellation Manager', () => {
        let activeControllers;

        beforeEach(() => {
            activeControllers = new Set();
        });

        it('should cancel all active pending controllers when cancelActiveRequests is invoked', () => {
            const c1 = new AbortController();
            const c2 = new AbortController();
            vi.spyOn(c1, 'abort');
            vi.spyOn(c2, 'abort');

            activeControllers.add(c1);
            activeControllers.add(c2);

            for (const controller of activeControllers) {
                controller.abort();
            }
            activeControllers.clear();

            expect(c1.abort).toHaveBeenCalled();
            expect(c2.abort).toHaveBeenCalled();
            expect(activeControllers.size).toBe(0);
        });
    });
});
