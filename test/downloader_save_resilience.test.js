import { describe, it, expect, vi } from 'vitest';

describe('Downloader Save Lock Resilience & Fail Download Idempotency Tests', () => {

    it('should continue accepting new save calls even if a previous save call throws an exception (saveLock catch chain)', async () => {
        let saveLock = Promise.resolve();
        const savedData = [];

        const queueSave = (data, shouldFail = false) => {
            saveLock = saveLock.then(async () => {
                if (shouldFail) {
                    throw new Error('Disk write error (EPERM)');
                }
                savedData.push(data);
            }).catch(err => {
                // Catch handler prevents saveLock from staying rejected permanently
                console.error(`Logged save error: ${err.message}`);
            });
            return saveLock;
        };

        // Task 1 fails
        queueSave('episode_1', true);
        
        // Task 2 succeeds
        await queueSave('episode_2', false);

        // Task 3 succeeds
        await queueSave('episode_3', false);

        // Verify task 2 & 3 were processed despite task 1 failing
        expect(savedData).toEqual(['episode_2', 'episode_3']);
    });

    it('should prevent activeDownloadsCount from going below zero on duplicate fail calls', () => {
        let activeDownloadsCount = 1;
        const activeDownloads = { 'anime1_ep1': { url: 'https://example.com' } };

        const failDownload = (downloadId) => {
            if (!activeDownloads[downloadId]) return;
            delete activeDownloads[downloadId];
            activeDownloadsCount = Math.max(0, activeDownloadsCount - 1);
        };

        // First call
        failDownload('anime1_ep1');
        expect(activeDownloadsCount).toBe(0);

        // Duplicate call for same ID
        failDownload('anime1_ep1');
        expect(activeDownloadsCount).toBe(0); // Should not become -1
    });
});
