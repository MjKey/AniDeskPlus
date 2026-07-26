/**
 * Менеджер HLS.js потока.
 * Инкапсулирует создание, загрузку источника, переключение качества и очистку.
 */
export class HlsManager {
    constructor() {
        /** @type {any|null} */
        this._hls = null;
        /** @type {HTMLVideoElement|null} */
        this._video = null;
        /** @type {((percent: number) => void)|null} */
        this.onLoadedPercent = null;
    }

    /**
     * Инициализация менеджера
     * @param {HTMLVideoElement} video
     * @param {(percent: number) => void} [onLoadedPercent]
     */
    init(video, onLoadedPercent) {
        this._video = video;
        if (onLoadedPercent) {
            this.onLoadedPercent = onLoadedPercent;
        }
    }

    /**
     * Создает новый инстанс HLS.js с привязкой обработчиков
     * @private
     */
    _createHlsInstance() {
        this.destroy();

        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            this._hls = new Hls();
            this._hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data && data.fatal) {
                    const netErrType = Hls.ErrorTypes?.NETWORK_ERROR || "networkError";
                    const mediaErrType = Hls.ErrorTypes?.MEDIA_ERROR || "mediaError";
                    if (data.type === netErrType) {
                        console.warn("[HlsManager] Fatal HLS network error encountered, recovering with startLoad()", data);
                        try {
                            this._hls.startLoad();
                        } catch (e) {
                            console.error("[HlsManager] Error calling startLoad():", e);
                        }
                    } else if (data.type === mediaErrType) {
                        console.warn("[HlsManager] Fatal HLS media error encountered, recovering with recoverMediaError()", data);
                        try {
                            this._hls.recoverMediaError();
                        } catch (e) {
                            console.error("[HlsManager] Error calling recoverMediaError():", e);
                        }
                    } else {
                        console.error("[HlsManager] Unrecoverable fatal HLS error:", data);
                        this.destroy();
                    }
                }
            });
            this._hls.on(Hls.Events.BUFFER_APPENDING, (_e, data) => {
                const endPTS = data?.frag?._streams?.video?.endPTS ?? data?.frag?.endPTS;
                if (typeof endPTS === 'number' && this._video && this._video.duration) {
                    const percent = (endPTS / this._video.duration) * 100;
                    this.onLoadedPercent?.(percent);
                }
            });
        }
    }

    /**
     * Получить текущий инстанс HLS
     * @returns {any|null}
     */
    getHlsInstance() {
        return this._hls;
    }

    /**
     * Загрузить видео-источник (HLS или MP4/direct fallback)
     * @param {string} url
     * @param {boolean} [autoPlay=true]
     */
    loadSource(url, autoPlay = true) {
        if (!this._video) return;

        const isHls = HlsManager.isHlsUrl(url);

        if (isHls) {
            this._createHlsInstance();
            if (this._hls) {
                this._hls.loadSource(url);
                this._hls.attachMedia(this._video);
                if (autoPlay) {
                    this._hls.once(Hls.Events.MANIFEST_PARSED, () => {
                        if (this._video) {
                            this._video.play().catch((e) => {
                                console.warn("[HlsManager] Autoplay error after manifest parsed:", e);
                            });
                        }
                    });
                }
            }
        } else {
            this.destroy();
            this._video.src = url;
            if (autoPlay) {
                const onMetadata = () => {
                    if (this._video) {
                        this._video.play().catch((e) => {
                            console.warn("[HlsManager] Autoplay error:", e);
                        });
                    }
                };
                if (this._video.readyState >= 1) {
                    onMetadata();
                } else {
                    this._video.addEventListener("loadedmetadata", onMetadata, { once: true });
                }
            }
        }
    }

    /**
     * Переключить качество видео с сохранением текущей позиции
     * @param {string} qualityUrl
     */
    changeQuality(qualityUrl) {
        if (!this._video) return;

        const url = qualityUrl.startsWith('//') ? `https:${qualityUrl}` : qualityUrl;
        const isHls = HlsManager.isHlsUrl(url);

        if (isHls) {
            const currentTime = this._video.currentTime || 0;
            const isPausedNow = this._video.paused;

            this._createHlsInstance();
            if (this._hls) {
                this._hls.loadSource(url);
                this._hls.attachMedia(this._video);
                this._hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    if (this._video) {
                        this._video.currentTime = currentTime;
                        if (!isPausedNow) {
                            this._video.play().catch(() => {});
                        }
                    }
                });
            }
        } else {
            const currentTime = this._video.currentTime || 0;
            const isPausedNow = this._video.paused;
            const videoEl = this._video;
            this.destroy();
            videoEl.src = url;

            const onMetadata = () => {
                videoEl.removeEventListener("loadedmetadata", onMetadata);
                try {
                    videoEl.currentTime = currentTime;
                } catch (e) {
                    console.error("[HlsManager] Error setting currentTime:", e);
                }
                if (!isPausedNow) {
                    videoEl.play().catch(() => {});
                }
            };

            if (videoEl.readyState >= 1) {
                onMetadata();
            } else {
                videoEl.addEventListener("loadedmetadata", onMetadata, { once: true });
            }
        }
    }

    /**
     * Уничтожить HLS инстанс
     */
    destroy() {
        if (this._hls) {
            try {
                this._hls.detachMedia();
                this._hls.destroy();
            } catch (e) {
                console.error("Error destroying HLS:", e);
            }
            this._hls = null;
        }
    }

    /**
     * Проверка, является ли URL стримом HLS
     * @param {string} url
     */
    static isHlsUrl(url) {
        if (!url || typeof url !== 'string') return false;
        if (url.startsWith('anixflow://') || url.startsWith('anidesk-offline://')) return false;
        if (typeof Hls === 'undefined' || !Hls.isSupported()) return false;
        try {
            return !new URL(url, window.location.href).pathname.endsWith('.mp4');
        } catch {
            return false;
        }
    }
}

export default HlsManager;
