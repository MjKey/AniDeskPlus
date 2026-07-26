import { describe, it, expect } from 'vitest';
import utils from '../src/app/utils.js';

describe('Time Formatting & Utils Unit Tests', () => {

    describe('returnFormatedTime helper', () => {
        it('should format seconds into M:SS for durations under 1 hour', () => {
            expect(utils.returnFormatedTime(0)).toBe('0:00');
            expect(utils.returnFormatedTime(5)).toBe('0:05');
            expect(utils.returnFormatedTime(65)).toBe('1:05');
            expect(utils.returnFormatedTime(1425)).toBe('23:45');
        });

        it('should format durations over 1 hour into H:MM:SS', () => {
            expect(utils.returnFormatedTime(3605)).toBe('1:00:05');
            expect(utils.returnFormatedTime(7384)).toBe('2:03:04');
        });

        it('should handle negative, NaN or invalid inputs safely', () => {
            expect(utils.returnFormatedTime(-10)).toBe('0:00');
            expect(utils.returnFormatedTime(NaN)).toBe('0:00');
            expect(utils.returnFormatedTime(null)).toBe('0:00');
        });
    });

    describe('getNumericWord declension helper', () => {
        it('should return correct Russian noun form based on number', () => {
            const words = ['день', 'дня', 'дней'];
            expect(utils.getNumericWord(1, words)).toBe('день');
            expect(utils.getNumericWord(2, words)).toBe('дня');
            expect(utils.getNumericWord(5, words)).toBe('дней');
            expect(utils.getNumericWord(21, words)).toBe('день');
            expect(utils.getNumericWord(105, words)).toBe('дней');
        });
    });

    describe('returnEpisodeString helper', () => {
        it('should format episode counts correctly', () => {
            expect(utils.returnEpisodeString({ episodes_released: 12, episodes_total: 12 })).toBe(12);
            expect(utils.returnEpisodeString({ episodes_released: 5, episodes_total: 12 })).toBe('5 из 12');
            expect(utils.returnEpisodeString({ episodes_released: 3, episodes_total: null })).toBe('3 из ?');
        });
    });

    describe('sortEpisodes helper', () => {
        it('should sort episodes numerically by episode position/number', () => {
            const unsorted = [
                { name: '10 серия' },
                { name: '2 серия' },
                { name: '1 серия' }
            ];
            const sorted = utils.sortEpisodes([...unsorted]);
            expect(sorted[0].name).toBe('1 серия');
            expect(sorted[1].name).toBe('2 серия');
            expect(sorted[2].name).toBe('10 серия');
        });
    });
});
