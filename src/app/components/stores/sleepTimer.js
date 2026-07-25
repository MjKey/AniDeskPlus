import { writable } from 'svelte/store';

/**
 * Менеджер таймера сна для плеера.
 */
export class SleepTimer {
    /**
     * @param {object} options
     * @param {() => string} [options.getAction] - Функция получения целевого действия (pause, closePlayer, etc)
     * @param {object} [options.handlers]
     * @param {() => void} [options.handlers.pause]
     * @param {() => void} [options.handlers.closePlayer]
     * @param {() => void} [options.handlers.closeApp]
     * @param {() => void} [options.handlers.sleep]
     * @param {() => void} [options.handlers.shutdown]
     * @param {(label: string) => void} [options.onLabelChange]
     */
    constructor(options = {}) {
        this.getAction = options.getAction || (() => "pause");
        this.handlers = options.handlers || {};
        this.onLabelChange = options.onLabelChange || (() => {});

        this.type = 'off';
        this.value = 0;
        this.episodesRemaining = 0;
        this.interval = null;
        this.endTime = null;
        this.label = "Выкл";
    }

    _setLabel(label) {
        this.label = label;
        this.onLabelChange(label);
    }

    clear() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.endTime = null;
        this.type = 'off';
        this.value = 0;
        this.episodesRemaining = 0;
        this._setLabel("Выкл");
    }

    async executeAction() {
        this.clear();
        const action = this.getAction();

        switch (action) {
            case "pause":
                this.handlers.pause?.();
                break;
            case "closePlayer":
                this.handlers.pause?.();
                this.handlers.closePlayer?.();
                break;
            case "closeApp":
                this.handlers.pause?.();
                if (window.systemPower) {
                    window.systemPower.quitApp();
                } else {
                    this.handlers.closeApp?.();
                }
                break;
            case "sleep":
                this.handlers.pause?.();
                if (window.systemPower) {
                    window.systemPower.sleep();
                } else {
                    this.handlers.sleep?.();
                }
                break;
            case "shutdown":
                this.handlers.pause?.();
                if (window.systemPower) {
                    window.systemPower.shutdown();
                } else {
                    this.handlers.shutdown?.();
                }
                break;
        }
    }

    change(config) {
        this.clear();
        if (!config || config.type === 'off') {
            this._setLabel("Выкл");
            return;
        }

        if (config.type === 'episodes') {
            const count = Math.max(1, parseInt(config.count || 1, 10));
            this.type = 'episodes';
            this.episodesRemaining = count;
            this._setLabel(count === 1 ? "1 серия" : `${count} с.`);
            return;
        }

        if (config.type === 'minutes') {
            const mins = Math.max(1, parseInt(config.minutes || 1, 10));
            this.type = 'minutes';
            this.value = mins;
            this._setLabel(`${mins} мин.`);
            this.endTime = Date.now() + mins * 60 * 1000;

            this.interval = setInterval(() => {
                if (!this.endTime) return;
                const remainingSec = Math.round((this.endTime - Date.now()) / 1000);

                if (remainingSec <= 0) {
                    this.executeAction();
                } else {
                    const m = Math.floor(remainingSec / 60);
                    const s = remainingSec % 60;
                    this._setLabel(`${m}:${s < 10 ? "0" + s : s}`);
                }
            }, 1000);
        }
    }

    async onEpisodeEnd() {
        if (this.type === 'episodes') {
            this.episodesRemaining--;
            if (this.episodesRemaining <= 0) {
                await this.executeAction();
                return true; // triggered
            } else {
                this._setLabel(this.episodesRemaining === 1 ? "1 серия" : `${this.episodesRemaining} с.`);
            }
        }
        return false;
    }
}

export default SleepTimer;
