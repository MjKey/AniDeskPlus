import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Helper sanitization logic for filenames
function sanitizeFileName(name) {
    if (!name) return 'download';
    return String(name).replace(/[/\\?%*:|"<>]/g, '_').trim();
}

// Queue management logic unit simulation
class DownloadQueueManager {
    constructor(maxConcurrent = 2) {
        this.maxConcurrent = maxConcurrent;
        this.activeCount = 0;
        this.queue = [];
        this.registry = new Map();
    }

    add(id, item) {
        this.registry.set(id, { ...item, status: 'queued', percent: 0 });
        this.queue.push(id);
        this.process();
    }

    cancel(id) {
        const item = this.registry.get(id);
        if (item) {
            const wasDownloading = item.status === 'downloading';
            item.status = 'cancelled';
            const qIdx = this.queue.indexOf(id);
            if (qIdx !== -1) this.queue.splice(qIdx, 1);
            if (wasDownloading) {
                this.activeCount = Math.max(0, this.activeCount - 1);
            }
            this.registry.delete(id);
            this.process();
            return true;
        }
        return false;
    }

    process() {
        while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
            const nextId = this.queue.shift();
            const item = this.registry.get(nextId);
            if (item && item.status === 'queued') {
                item.status = 'downloading';
                this.activeCount++;
            }
        }
    }
}

describe('Downloader Engine Unit Tests', () => {
    
    describe('Filename Sanitization', () => {
        it('should sanitize illegal Windows filename characters', () => {
            const dirtyName = 'Anime: Season 1 / Ep? 5 * [1080p] <Main|Test>';
            const clean = sanitizeFileName(dirtyName);
            expect(clean).not.toMatch(/[/\\?%*:|"<>]/);
            expect(clean).toBe('Anime_ Season 1 _ Ep_ 5 _ [1080p] _Main_Test_');
        });

        it('should fallback to "download" for empty or null inputs', () => {
            expect(sanitizeFileName('')).toBe('download');
            expect(sanitizeFileName(null)).toBe('download');
            expect(sanitizeFileName(undefined)).toBe('download');
        });
    });

    describe('Download Queue Manager', () => {
        let qManager;

        beforeEach(() => {
            qManager = new DownloadQueueManager(2);
        });

        it('should start up to maxConcurrent tasks immediately', () => {
            qManager.add('task1', { url: 'https://example.com/1.m3u8' });
            qManager.add('task2', { url: 'https://example.com/2.mp4' });
            qManager.add('task3', { url: 'https://example.com/3.mp4' });

            expect(qManager.activeCount).toBe(2);
            expect(qManager.registry.get('task1').status).toBe('downloading');
            expect(qManager.registry.get('task2').status).toBe('downloading');
            expect(qManager.registry.get('task3').status).toBe('queued');
        });

        it('should process queued tasks as active ones complete/cancel', () => {
            qManager.add('task1', { url: '1.mp4' });
            qManager.add('task2', { url: '2.mp4' });
            qManager.add('task3', { url: '3.mp4' });

            qManager.cancel('task1');
            expect(qManager.activeCount).toBe(2);
            expect(qManager.registry.get('task3').status).toBe('downloading');
        });
    });

    describe('Atomic File Storage Logic', () => {
        let tempDir;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anixflow-test-'));
        });

        afterEach(() => {
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        it('should write atomically using temporary file rename pattern', async () => {
            const targetFile = path.join(tempDir, 'library.json');
            const tmpFile = targetFile + '.tmp';
            const sampleData = [{ id: 101, title: 'Test Anime', episodes: [] }];

            // Simulate atomic save logic
            await fs.promises.writeFile(tmpFile, JSON.stringify(sampleData, null, 2));
            await fs.promises.rename(tmpFile, targetFile);

            expect(fs.existsSync(targetFile)).toBe(true);
            expect(fs.existsSync(tmpFile)).toBe(false);

            const readBack = JSON.parse(await fs.promises.readFile(targetFile, 'utf8'));
            expect(readBack).toEqual(sampleData);
        });
    });
});
