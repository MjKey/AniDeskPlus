import { describe, it, expect } from 'vitest';

const DEFAULT_SHIKIMORI_DOMAIN = 'shikimori.one';

function resolveShikimoriDomain(savedDomain) {
    const validDomains = ['shikimori.one', 'shikimori.me', 'shikimori.io'];
    if (savedDomain && validDomains.includes(savedDomain)) {
        return savedDomain;
    }
    return DEFAULT_SHIKIMORI_DOMAIN;
}

function getShikimoriAuthUrl(domain = 'shikimori.one', clientId = 'test_client_id') {
    const cleanDomain = resolveShikimoriDomain(domain);
    return `https://${cleanDomain}/oauth/authorize?client_id=${clientId}&redirect_uri=urn%3Aietf%3Awg%3Aoauth%3A2.0%3Aoob&response_type=code&scope=user_rates`;
}

function isValidShikimoriToken(token) {
    if (!token || typeof token !== 'string') return false;
    const trimmed = token.trim();
    return trimmed.length >= 20 && !/\s/.test(trimmed);
}

describe('Shikimori OAuth & Domain Resolver Utilities', () => {

    describe('Domain Resolver', () => {
        it('should return valid saved domain', () => {
            expect(resolveShikimoriDomain('shikimori.me')).toBe('shikimori.me');
            expect(resolveShikimoriDomain('shikimori.io')).toBe('shikimori.io');
        });

        it('should fallback to default domain for unknown or invalid domains', () => {
            expect(resolveShikimoriDomain('invalid-domain.com')).toBe('shikimori.one');
            expect(resolveShikimoriDomain(null)).toBe('shikimori.one');
            expect(resolveShikimoriDomain('')).toBe('shikimori.one');
        });
    });

    describe('Auth URL Generator', () => {
        it('should construct valid OAuth authorization URL', () => {
            const url = getShikimoriAuthUrl('shikimori.me', 'my_client_id');
            expect(url.startsWith('https://shikimori.me/oauth/authorize')).toBe(true);
            expect(url).toContain('client_id=my_client_id');
            expect(url).toContain('response_type=code');
        });
    });

    describe('Token Validator', () => {
        it('should validate non-empty tokens of sufficient length', () => {
            expect(isValidShikimoriToken('abc123def456ghi789jkl012')).toBe(true);
        });

        it('should reject short or malformed tokens', () => {
            expect(isValidShikimoriToken('123')).toBe(false);
            expect(isValidShikimoriToken('token with spaces')).toBe(false);
            expect(isValidShikimoriToken(null)).toBe(false);
        });
    });
});
