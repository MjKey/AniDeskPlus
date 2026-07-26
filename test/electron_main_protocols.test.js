import { describe, it, expect } from 'vitest';

// Extract helpers from main.js or recreate exact signatures for unit testing
function isKodikDomain(host) {
    if (!host) return false;
    return host.includes('kodik') || host.includes('aniqit') || host.includes('kodikplayer');
}

function isBlockedImageDomain(url) {
    if (!url) return false;
    try {
        const host = new URL(url).host;
        return host.includes('kinopoisk') ||
            host.includes('yandex') ||
            host.includes('anixart') ||
            host.includes('shikimori') ||
            host.includes('anixmirai') ||
            host.includes('vk.com');
    } catch (_) {
        return false;
    }
}

function hexEncodeUrl(url) {
    return Buffer.from(url, 'utf8').toString('hex');
}

function hexDecodeUrl(hexStr) {
    return Buffer.from(hexStr, 'hex').toString('utf8');
}

function getProxyImageUrl(url) {
    if (!url) return url;
    if (isBlockedImageDomain(url)) {
        const hex = hexEncodeUrl(url);
        return `anixflow-cache://${hex}`;
    }
    return url;
}

describe('Electron Main IPC & Protocol Helpers', () => {

    describe('Kodik Domain Detector', () => {
        it('should detect Kodik CDN domains correctly', () => {
            expect(isKodikDomain('kodik.info')).toBe(true);
            expect(isKodikDomain('kodikplayer.com')).toBe(true);
            expect(isKodikDomain('aniqit.com')).toBe(true);
        });

        it('should return false for non-Kodik domains', () => {
            expect(isKodikDomain('video.sibnet.ru')).toBe(false);
            expect(isKodikDomain('anilibria.tv')).toBe(false);
            expect(isKodikDomain(null)).toBe(false);
        });
    });

    describe('Blocked Image Domain Detector for CDN Proxy', () => {
        it('should flag blocked image domains requiring proxy', () => {
            expect(isBlockedImageDomain('https://st.kp.yandex.net/images/poster.jpg')).toBe(true);
            expect(isBlockedImageDomain('https://shikimori.one/system/animes/original/123.jpg')).toBe(true);
            expect(isBlockedImageDomain('https://anixart.tv/covers/anime_1.png')).toBe(true);
            expect(isBlockedImageDomain('https://anixmirai.com/assets/banner.webp')).toBe(true);
        });

        it('should not flag unblocked domains', () => {
            expect(isBlockedImageDomain('https://my-custom-domain.org/image.png')).toBe(false);
            expect(isBlockedImageDomain('invalid-url')).toBe(false);
        });
    });

    describe('Hex Encoding / Decoding for Custom Cache Protocol', () => {
        it('should perform loss-less hex encoding and decoding', () => {
            const original = 'https://shikimori.one/system/animes/original/54321.jpg?v=12345';
            const encoded = hexEncodeUrl(original);
            expect(encoded).not.toContain('http');
            expect(hexDecodeUrl(encoded)).toBe(original);
        });

        it('should format cached image URL into anixflow-cache:// scheme', () => {
            const blockedUrl = 'https://anixart.tv/covers/anime_1.png';
            const proxyUrl = getProxyImageUrl(blockedUrl);
            expect(proxyUrl.startsWith('anixflow-cache://')).toBe(true);
        });
    });
});
