/**
 * Менеджер Discord Rich Presence для плеера.
 */
export class DiscordRpcManager {
    /**
     * @param {{ releaseId: number|string, releaseTitle: string }} releaseInfo
     */
    constructor(releaseInfo) {
        this.releaseId = releaseInfo?.releaseId;
        this.releaseTitle = releaseInfo?.releaseTitle ? String(releaseInfo.releaseTitle).slice(0, 127) : "";
    }

    /**
     * Формирует список стандартных кнопок для Discord RPC.
     * @private
     */
    _getButtons() {
        return [
            {
                label: "Ссылка на релиз",
                url: `https://anixart.app/release/${this.releaseId}`,
            },
            {
                label: "Ссылка на клиент",
                url: "https://github.com/MjKey/AniXFlow",
            },
        ];
    }

    /**
     * Обновить статус в Discord при воспроизведении.
     * @param {string} episodeName
     * @param {number} currentTime
     * @param {number} duration
     */
    setPlaying(episodeName, currentTime = 0, duration = 0) {
        if (!window.discordRPC) return;

        const startTimestamp = Date.now();
        const start = startTimestamp - (currentTime || 0) * 1000;
        const end = duration ? startTimestamp + (duration - (currentTime || 0)) * 1000 : undefined;

        window.discordRPC.setActivity({
            type: 3,
            state: episodeName ? `${episodeName}` : "",
            details: this.releaseTitle,
            largeImageKey: "anidesk-transparent",
            largeImageText: "AniXFlow - Anixart Client",
            startTimestamp: start,
            ...(end ? { endTimestamp: end } : {}),
            instance: true,
            buttons: this._getButtons(),
        });
    }

    /**
     * Обновить статус в Discord при паузе.
     * @param {string} episodeName
     */
    setPaused(episodeName) {
        if (!window.discordRPC) return;

        window.discordRPC.setActivity({
            type: 3,
            state: episodeName ? `${episodeName}` : "",
            details: this.releaseTitle,
            largeImageKey: "anidesk-transparent",
            largeImageText: "AniXFlow - Anixart Client",
            instance: true,
            buttons: this._getButtons(),
        });
    }

    /**
     * Сбросить статус Discord RPC.
     */
    setIdle() {
        if (!window.discordRPC) return;
        window.discordRPC.clearActivity();
    }

    clear() {
        if (window.discordRPC && typeof window.discordRPC.clearActivity === 'function') {
            window.discordRPC.clearActivity();
        }
    }

    destroy() {
        this.clear();
    }
}

export default DiscordRpcManager;
