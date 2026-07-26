import { describe, it, expect } from 'vitest';

// ── 1. Preferred Dubber & Source Resolution Logic ─────────────────────────────
function getPreferredDubberId(dubbers, savedPreferredDubber, favoriteDubberName) {
    if (!dubbers || dubbers.length === 0) return null;
    
    if (savedPreferredDubber) {
        const match = dubbers.find(d => d.name.toLowerCase().trim() === savedPreferredDubber.toLowerCase().trim());
        if (match) return match.id;
    }

    if (favoriteDubberName) {
        const match = dubbers.find(d => d.name.toLowerCase().trim() === favoriteDubberName.toLowerCase().trim());
        if (match) return match.id;
    }

    return dubbers[0].id;
}

function getPreferredSource(sources, favoriteSourceName) {
    if (!sources || sources.length === 0) return null;

    if (favoriteSourceName) {
        const match = sources.find(s => s.name.toLowerCase().trim() === favoriteSourceName.toLowerCase().trim());
        if (match) return match;
    }

    return sources[0];
}

// ── 2. Episode Sorting Helper Logic ──────────────────────────────────────────
function sortEpisodes(episodes, sortOrder = 'asc') {
    if (!Array.isArray(episodes)) return [];
    return [...episodes].sort((a, b) => {
        const posA = a.position ?? a.id ?? 0;
        const posB = b.position ?? b.id ?? 0;
        return sortOrder === 'asc' ? posA - posB : posB - posA;
    });
}

// ── 3. Quality Selection Helper Logic ────────────────────────────────────────
function pickDownloadQuality(availableQuality, defaultQuality = 720) {
    if (!availableQuality || Object.keys(availableQuality).length === 0) return null;

    if (availableQuality[defaultQuality]) {
        return availableQuality[defaultQuality];
    }

    const numericQualities = Object.keys(availableQuality)
        .map(q => parseInt(q, 10))
        .filter(n => !isNaN(n))
        .sort((a, b) => b - a);

    if (numericQualities.length > 0) {
        const closest = numericQualities.find(q => q <= defaultQuality) || numericQualities[0];
        return availableQuality[closest];
    }

    return Object.values(availableQuality)[0];
}

// ── 4. Offline Protocol URL Construction ─────────────────────────────────────
function formatOfflineUrl(filePath) {
    if (!filePath) return '';
    const hexPath = Array.from(new TextEncoder().encode(filePath))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return `anixflow://${hexPath}`;
}

function decodeOfflineUrl(offlineUrl) {
    if (!offlineUrl || !offlineUrl.startsWith('anixflow://')) return '';
    const hexPath = offlineUrl.replace('anixflow://', '').replace(/\/$/, '');
    return Buffer.from(hexPath, 'hex').toString('utf8');
}


// ── TEST SUITE ───────────────────────────────────────────────────────────────
describe('Dubber and Player Source Switching Logic', () => {

    describe('Preferred Dubber Selection', () => {
        const mockDubbers = [
            { id: 1, name: 'Anilibria', view_count: 5000 },
            { id: 2, name: 'Studio Band', view_count: 12000 },
            { id: 3, name: 'Dubbed Voice', view_count: 3000 }
        ];

        it('should return saved per-anime preferred dubber if matched', () => {
            const selected = getPreferredDubberId(mockDubbers, 'Studio Band', 'Anilibria');
            expect(selected).toBe(2);
        });

        it('should fall back to global favorite dubber if per-anime preference is not found', () => {
            const selected = getPreferredDubberId(mockDubbers, 'NonExistent', 'Dubbed Voice');
            expect(selected).toBe(3);
        });

        it('should fall back to first available dubber if no matches found', () => {
            const selected = getPreferredDubberId(mockDubbers, 'Unknown 1', 'Unknown 2');
            expect(selected).toBe(1);
        });

        it('should handle empty or null dubber array gracefully', () => {
            expect(getPreferredDubberId([], 'Studio Band')).toBeNull();
            expect(getPreferredDubberId(null, 'Studio Band')).toBeNull();
        });
    });

    describe('Preferred Video Source Selection', () => {
        const mockSources = [
            { id: 10, name: 'Kodik' },
            { id: 20, name: 'Libria' },
            { id: 30, name: 'Sibnet' }
        ];

        it('should return matching favorite source', () => {
            const source = getPreferredSource(mockSources, 'Sibnet');
            expect(source).toEqual({ id: 30, name: 'Sibnet' });
        });

        it('should fall back to first source if favorite is unavailable', () => {
            const source = getPreferredSource(mockSources, 'NonExistentPlayer');
            expect(source).toEqual({ id: 10, name: 'Kodik' });
        });

        it('should handle empty or null sources array gracefully', () => {
            expect(getPreferredSource([])).toBeNull();
            expect(getPreferredSource(null)).toBeNull();
        });
    });

    describe('Episode Sorting Logic', () => {
        const mockEpisodes = [
            { id: 5, name: 'Episode 5', position: 5 },
            { id: 1, name: 'Episode 1', position: 1 },
            { id: 3, name: 'Episode 3', position: 3 }
        ];

        it('should sort episodes in ascending position order', () => {
            const sorted = sortEpisodes(mockEpisodes, 'asc');
            expect(sorted.map(e => e.position)).toEqual([1, 3, 5]);
        });

        it('should sort episodes in descending position order', () => {
            const sorted = sortEpisodes(mockEpisodes, 'desc');
            expect(sorted.map(e => e.position)).toEqual([5, 3, 1]);
        });
    });

    describe('Quality Picker Logic', () => {
        const availableQuality = {
            '1080': { src: 'https://cdn.example.com/1080.mp4' },
            '720': { src: 'https://cdn.example.com/720.mp4' },
            '480': { src: 'https://cdn.example.com/480.mp4' }
        };

        it('should pick requested default quality if available', () => {
            const res = pickDownloadQuality(availableQuality, 720);
            expect(res.src).toBe('https://cdn.example.com/720.mp4');
        });

        it('should pick closest lower quality if exact default quality is missing', () => {
            const res = pickDownloadQuality({ '1080': { src: '1080.mp4' }, '480': { src: '480.mp4' } }, 720);
            expect(res.src).toBe('480.mp4');
        });

        it('should return null for empty quality map', () => {
            expect(pickDownloadQuality({})).toBeNull();
            expect(pickDownloadQuality(null)).toBeNull();
        });
    });

    describe('Offline Protocol anixflow:// Encoding & Decoding', () => {
        it('should encode local file path into anixflow:// hex scheme', () => {
            const path = 'C:/AppData/offline_storage/Anime - Episode 1.mp4';
            const url = formatOfflineUrl(path);
            expect(url.startsWith('anixflow://')).toBe(true);
            expect(url).not.toContain('Anime'); // hex encoded
        });

        it('should decode anixflow:// hex scheme back to exact local file path', () => {
            const path = 'C:/AppData/offline_storage/Anime - Episode 1.mp4';
            const url = formatOfflineUrl(path);
            const decoded = decodeOfflineUrl(url);
            expect(decoded).toBe(path);
        });
    });
});
