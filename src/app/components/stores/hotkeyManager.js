/**
 * Менеджер клавиатурных комбинаций (hotkeys) для плеера.
 */
export class HotkeyManager {
    /**
     * @param {object} options
     * @param {() => object} options.getHotkeys - Функция получения актуальных hotkeys из настроек
     * @param {object} options.handlers - Обработчики действий
     * @param {() => void} [options.handlers.hotkeyPlayPause]
     * @param {() => void} [options.handlers.hotkeyMute]
     * @param {() => void} [options.handlers.hotkeyFullscreen]
     * @param {() => void} [options.handlers.hotkeyForward]
     * @param {() => void} [options.handlers.hotkeyBackward]
     * @param {() => void} [options.handlers.hotkeySkipOpening]
     * @param {() => void} [options.handlers.hotkeyNextEpisode]
     * @param {() => void} [options.handlers.hotkeyPrevEpisode]
     * @param {() => void} [options.handlers.onEscape]
     * @param {(deltaY: number) => void} [options.handlers.onWheel]
     */
    constructor(options = {}) {
        this.getHotkeys = options.getHotkeys || (() => ({}));
        this.handlers = options.handlers || {};
        this.pressedKeys = new Set();

        this._keydownHandler = this._handleKeyDown.bind(this);
        this._keyupHandler = this._handleKeyUp.bind(this);
        this._blurHandler = this._handleBlur.bind(this);
        this._wheelHandler = this._handleWheel.bind(this);
    }

    _handleKeyDown(e) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
        this.pressedKeys.add(e.code);
        const hotkeys = this.getHotkeys() || {};

        for (const [action, keys] of Object.entries(hotkeys)) {
            if (!Array.isArray(keys) || keys.length !== this.pressedKeys.size) continue;

            if (keys.every((key) => this.pressedKeys.has(key))) {
                if (typeof this.handlers[action] === 'function') {
                    this.handlers[action]();
                }
                this.pressedKeys.clear();
                break;
            }
        }

        if (e.code === "Escape") {
            if (typeof this.handlers.onEscape === 'function') {
                this.handlers.onEscape();
            }
        }
    }

    _handleKeyUp(e) {
        this.pressedKeys.delete(e.code);
    }

    _handleBlur() {
        this.pressedKeys.clear();
    }

    _handleWheel(e) {
        if (e.target && e.target.closest && e.target.closest('.player-settings, .dropdown, .episode-select, .settings-menu, .scrollable, .modal-content, .modal-background, .menu, select')) {
            return;
        }
        if (typeof this.handlers.onWheel === 'function') {
            this.handlers.onWheel(e.deltaY);
        }
    }

    /**
     * Привязать события к window
     */
    attach() {
        window.addEventListener('keydown', this._keydownHandler);
        window.addEventListener('keyup', this._keyupHandler);
        window.addEventListener('blur', this._blurHandler);
        window.addEventListener('wheel', this._wheelHandler);
    }

    /**
     * Отвязать события от window
     */
    detach() {
        window.removeEventListener('keydown', this._keydownHandler);
        window.removeEventListener('keyup', this._keyupHandler);
        window.removeEventListener('blur', this._blurHandler);
        window.removeEventListener('wheel', this._wheelHandler);
        this.pressedKeys.clear();
    }
}

export default HotkeyManager;
