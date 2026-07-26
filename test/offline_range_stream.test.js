import { describe, it, expect } from 'vitest';

function parseRangeHeader(rangeHeader, fileSize) {
    if (!rangeHeader) {
        return { status: 200, start: 0, end: fileSize - 1, chunkSize: fileSize };
    }

    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    let start, end;

    if (parts[0] === '') {
        const suffixLength = parseInt(parts[1], 10);
        start = Math.max(0, fileSize - suffixLength);
        end = fileSize - 1;
    } else {
        start = parseInt(parts[0], 10);
        end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    }

    if (isNaN(start) || start >= fileSize) {
        return { status: 416, contentRange: `bytes */${fileSize}` };
    }

    end = Math.min(end, fileSize - 1);
    const chunkSize = end - start + 1;

    return {
        status: 206,
        start,
        end,
        chunkSize,
        contentRange: `bytes ${start}-${end}/${fileSize}`
    };
}

describe('Offline Protocol HTTP Range Stream Calculation Unit Tests', () => {

    const TOTAL_FILE_SIZE = 104857600; // 100 MB

    it('should return 200 full file metadata when Range header is omitted', () => {
        const res = parseRangeHeader(null, TOTAL_FILE_SIZE);
        expect(res.status).toBe(200);
        expect(res.start).toBe(0);
        expect(res.end).toBe(TOTAL_FILE_SIZE - 1);
        expect(res.chunkSize).toBe(TOTAL_FILE_SIZE);
    });

    it('should parse explicit byte ranges (bytes=0-1023)', () => {
        const res = parseRangeHeader('bytes=0-1023', TOTAL_FILE_SIZE);
        expect(res.status).toBe(206);
        expect(res.start).toBe(0);
        expect(res.end).toBe(1023);
        expect(res.chunkSize).toBe(1024);
        expect(res.contentRange).toBe(`bytes 0-1023/${TOTAL_FILE_SIZE}`);
    });

    it('should parse open-ended ranges (bytes=50000-)', () => {
        const res = parseRangeHeader('bytes=50000-', TOTAL_FILE_SIZE);
        expect(res.status).toBe(206);
        expect(res.start).toBe(50000);
        expect(res.end).toBe(TOTAL_FILE_SIZE - 1);
        expect(res.chunkSize).toBe(TOTAL_FILE_SIZE - 50000);
    });

    it('should parse suffix ranges (bytes=-5000)', () => {
        const res = parseRangeHeader('bytes=-5000', TOTAL_FILE_SIZE);
        expect(res.status).toBe(206);
        expect(res.start).toBe(TOTAL_FILE_SIZE - 5000);
        expect(res.end).toBe(TOTAL_FILE_SIZE - 1);
        expect(res.chunkSize).toBe(5000);
    });

    it('should return HTTP 416 Range Not Satisfiable when range start exceeds file size', () => {
        const res = parseRangeHeader('bytes=200000000-', TOTAL_FILE_SIZE);
        expect(res.status).toBe(416);
        expect(res.contentRange).toBe(`bytes */${TOTAL_FILE_SIZE}`);
    });
});
