import { describe, it, expect, beforeEach } from 'vitest';

// ── 1. Sleep Timer Manager Simulation ───────────────────────────────────────
class SleepTimer {
    constructor() {
        this.active = false;
        this.type = 'off';
        this.remainingEpisodes = 0;
        this.targetTimestamp = 0;
        this.action = 'pause';
    }

    startMinutes(minutes, action = 'pause') {
        this.active = true;
        this.type = 'minutes';
        this.action = action;
        this.targetTimestamp = Date.now() + minutes * 60 * 1000;
    }

    startEpisodes(count, action = 'pause') {
        this.active = true;
        this.type = 'episodes';
        this.action = action;
        this.remainingEpisodes = count;
    }

    onEpisodeEnd() {
        if (!this.active || this.type !== 'episodes') return false;
        this.remainingEpisodes = Math.max(0, this.remainingEpisodes - 1);
        if (this.remainingEpisodes === 0) {
            this.active = false;
            return true; // Trigger action
        }
        return false;
    }

    checkTimeExpired() {
        if (!this.active || this.type !== 'minutes') return false;
        if (Date.now() >= this.targetTimestamp) {
            this.active = false;
            return true; // Trigger action
        }
        return false;
    }

    cancel() {
        this.active = false;
        this.type = 'off';
        this.remainingEpisodes = 0;
        this.targetTimestamp = 0;
    }
}

// ── 2. Volume Manager Simulation ─────────────────────────────────────────────
class VolumeManager {
    constructor() {
        this.volume = 1.0;
        this.isMuted = false;
        this.lastVolume = 1.0;
    }

    setVolume(vol) {
        const clamped = Math.max(0, Math.min(1.0, vol));
        this.volume = clamped;
        if (clamped > 0) {
            this.isMuted = false;
            this.lastVolume = clamped;
        } else {
            this.isMuted = true;
        }
    }

    toggleMute() {
        if (this.isMuted) {
            this.isMuted = false;
            this.volume = this.lastVolume > 0 ? this.lastVolume : 1.0;
        } else {
            this.lastVolume = this.volume;
            this.isMuted = true;
            this.volume = 0;
        }
        return this.isMuted;
    }
}

// ── 3. Page History Navigation Stack Simulation ──────────────────────────────
class PageHistoryStack {
    constructor() {
        this.stack = [];
    }

    push(pageIndex, args = null) {
        this.stack.push({ pageIndex, args });
    }

    pop() {
        if (this.stack.length <= 1) return null;
        this.stack.pop(); // Remove current
        return this.stack[this.stack.length - 1]; // Return previous
    }

    clear() {
        this.stack = [];
    }
}

describe('Player & UI State Managers', () => {

    describe('Sleep Timer Manager', () => {
        let timer;

        beforeEach(() => {
            timer = new SleepTimer();
        });

        it('should trigger action after N episode completions', () => {
            timer.startEpisodes(2, 'closePlayer');

            expect(timer.onEpisodeEnd()).toBe(false); // 1 episode remaining
            expect(timer.remainingEpisodes).toBe(1);

            expect(timer.onEpisodeEnd()).toBe(true);  // Triggered!
            expect(timer.active).toBe(false);
            expect(timer.action).toBe('closePlayer');
        });

        it('should detect when time duration has expired', () => {
            timer.startMinutes(0, 'pause'); // Instant expiry
            expect(timer.checkTimeExpired()).toBe(true);
            expect(timer.active).toBe(false);
        });

        it('should reset parameters on cancel', () => {
            timer.startEpisodes(5, 'sleep');
            timer.cancel();
            expect(timer.active).toBe(false);
            expect(timer.type).toBe('off');
        });
    });

    describe('Volume & Mute Manager', () => {
        let volManager;

        beforeEach(() => {
            volManager = new VolumeManager();
        });

        it('should clamp volume between 0.0 and 1.0', () => {
            volManager.setVolume(1.5);
            expect(volManager.volume).toBe(1.0);

            volManager.setVolume(-0.5);
            expect(volManager.volume).toBe(0.0);
            expect(volManager.isMuted).toBe(true);
        });

        it('should toggle mute and restore previous volume', () => {
            volManager.setVolume(0.8);
            expect(volManager.toggleMute()).toBe(true); // Muted
            expect(volManager.volume).toBe(0);

            expect(volManager.toggleMute()).toBe(false); // Unmuted
            expect(volManager.volume).toBe(0.8);
        });
    });

    describe('Page Navigation History Stack', () => {
        let navHistory;

        beforeEach(() => {
            navHistory = new PageHistoryStack();
        });

        it('should maintain push and pop navigation hierarchy', () => {
            navHistory.push(0, { title: 'Home' });
            navHistory.push(8, { title: 'Anime Release' });
            navHistory.push(11, { title: 'Player' });

            const prev = navHistory.pop();
            expect(prev.pageIndex).toBe(8);
            expect(prev.args.title).toBe('Anime Release');
        });

        it('should return null when popping root page', () => {
            navHistory.push(0);
            expect(navHistory.pop()).toBeNull();
        });
    });
});
