const PLAYER_LAST_VOLUME_KEY = "PlayerLastVolume";
const PLAYER_SAVE_VOLUME_ENABLED_KEY = "PlayerSaveUserVolumeEnabled";

/**
 * Менеджер управления громкостью плеера и её сохранением.
 */
export class VolumeManager {
    static clampVolume(value) {
        return Math.min(1, Math.max(0, Number(value) || 0));
    }

    constructor() {
        this.persistedVolume = null;
        this.persistedSaveVolumeEnabled = null;
    }

    /**
     * Загрузить сохраненные параметры громкости из electron settings IPC
     */
    async loadPersistedVolume() {
        if (!window.settings) return;

        try {
            const [savedVolume, savedSaveVolumeEnabled] = await Promise.all([
                window.settings.get(PLAYER_LAST_VOLUME_KEY),
                window.settings.get(PLAYER_SAVE_VOLUME_ENABLED_KEY),
            ]);

            this.persistedVolume = typeof savedVolume === "number" ? VolumeManager.clampVolume(savedVolume) : null;
            this.persistedSaveVolumeEnabled = typeof savedSaveVolumeEnabled === "boolean" ? savedSaveVolumeEnabled : null;
        } catch (e) {
            console.error("Error loading persisted volume:", e);
        }
    }

    getPersistedPlayerSettings() {
        try {
            const rawSettings = localStorage.getItem("playerSettings");
            return rawSettings ? JSON.parse(rawSettings) : null;
        } catch (error) {
            return null;
        }
    }

    getEffectivePlayerSettings(playerSettings, defaultSettings = {}) {
        const effectiveSettings = {
            ...defaultSettings,
            ...(this.getPersistedPlayerSettings() ?? playerSettings ?? {}),
        };

        if (this.persistedSaveVolumeEnabled !== null) {
            effectiveSettings.saveUserVolume = {
                ...effectiveSettings.saveUserVolume,
                enabled: this.persistedSaveVolumeEnabled,
            };
        }

        return effectiveSettings;
    }

    /**
     * Вычисляет стартовую громкость
     */
    getInitialVolume(playerSettings, defaultSettings = {}) {
        const effectivePlayerSettings = this.getEffectivePlayerSettings(playerSettings, defaultSettings);

        if (effectivePlayerSettings?.saveUserVolume?.enabled && this.persistedVolume !== null) {
            return this.persistedVolume;
        }

        if (effectivePlayerSettings?.saveUserVolume?.enabled) {
            return VolumeManager.clampVolume(
                effectivePlayerSettings.saveUserVolume.lastValue ??
                (effectivePlayerSettings.defaultVolume ? effectivePlayerSettings.defaultVolume / 100 : 1)
            );
        }

        return VolumeManager.clampVolume(
            effectivePlayerSettings?.defaultVolume ? effectivePlayerSettings.defaultVolume / 100 : 1
        );
    }

    /**
     * Сохраняет предпочтение по громкости
     */
    saveVolumePreference(volume, playerSettings, persistPlayerSettingsCallback) {
        if (!playerSettings?.saveUserVolume?.enabled) return;

        const normalizedVolume = VolumeManager.clampVolume(volume);

        if (typeof persistPlayerSettingsCallback === 'function') {
            persistPlayerSettingsCallback({
                ...playerSettings,
                saveUserVolume: {
                    ...playerSettings.saveUserVolume,
                    lastValue: normalizedVolume,
                },
            });
        }

        if (window.settings) {
            window.settings.set(PLAYER_LAST_VOLUME_KEY, normalizedVolume);
            window.settings.set(PLAYER_SAVE_VOLUME_ENABLED_KEY, true);
        }
    }

    /**
     * Синхронизация громкости с видео и контролом
     */
    setVolume(volume, video, volControl, playerSettings, persistPlayerSettingsCallback, persist = true) {
        const normalizedVolume = VolumeManager.clampVolume(volume);

        if (video) {
            video.volume = normalizedVolume;
        }

        if (volControl) {
            volControl.value = normalizedVolume;
        }

        if (persist) {
            this.saveVolumePreference(normalizedVolume, playerSettings, persistPlayerSettingsCallback);
        }

        return normalizedVolume * 100; // Returns volPercent
    }

    syncPersistedVolume(video, playerSettings, persistPlayerSettingsCallback) {
        if (!video || video.muted) return;
        this.saveVolumePreference(video.volume, playerSettings, persistPlayerSettingsCallback);
    }
}

export default VolumeManager;
