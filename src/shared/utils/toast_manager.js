// src/shared/utils/toast_manager.js

/* All dynamic text (host errors, filenames, usernames, page-derived labels) is inserted with
 * textContent, never innerHTML: these strings come from outside the extension and would
 * otherwise be parsed as HTML (and run handlers like onerror) inside the host page. */

/** Static, trusted icon markup: the only HTML this module ever parses. */
const MD_TOAST_ICON_SVGS = Object.freeze({
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
});

/**
 * @typedef {Object} ToastAction
 * @property {string} label - Button text
 * @property {string | null} [href] - Opened in a new tab; only http(s) URLs are accepted
 */

/**
 * @typedef {Object} ComplexToastOptions
 * @property {string} [title]
 * @property {string} [icon] - Emoji or short text
 * @property {string} [body]
 * @property {ToastAction | null} [action]
 * @property {() => void} [onClose]
 * @property {(event: MouseEvent) => (boolean | void)} [onAction] - Return false to keep the toast open
 * @property {number} [duration]
 */

class MDToastManager {
    constructor() {
        /** @type {HTMLElement | null} */
        this.currentToast = null;
        /** @type {number | null} */
        this.timeoutId = null;
    }

    _removeCurrentToast() {
        if (this.currentToast) {
            this.currentToast.remove();
            this.currentToast = null;
        }
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    /**
     * @param {string} className
     * @returns {HTMLElement}
     */
    _createBaseToast(className) {
        this._removeCurrentToast();
        const toast = document.createElement('div');
        toast.className = `md-toast ${className}`;
        this.currentToast = toast;
        return toast;
    }

    /**
     * @param {HTMLElement} toast
     * @param {number} duration
     * @returns {() => void} close function
     */
    _animateAndSchedule(toast, duration) {
        // Use documentElement to avoid appending to body (which Instagram React sometimes clears or manages)
        document.documentElement.appendChild(toast);

        // Entrance animation
        requestAnimationFrame(() => {
            toast.classList.add('md-show');
        });

        const close = () => {
            toast.classList.remove('md-show');
            setTimeout(() => {
                if (this.currentToast === toast) {
                    this._removeCurrentToast();
                } else if (toast.parentNode) {
                    toast.remove();
                }
            }, 400); // Wait for CSS transition
        };

        if (duration > 0) {
            this.timeoutId = setTimeout(close, duration);
            toast.addEventListener('mouseenter', () => clearTimeout(this.timeoutId));
            toast.addEventListener('mouseleave', () => {
                this.timeoutId = setTimeout(close, 2000); // 2 extra seconds if mouse leaves
            });
        }

        return close;
    }

    /**
     * @param {'info' | 'error' | 'success' | 'warning'} variant
     * @param {unknown} message
     * @param {number} duration
     * @param {unknown} [detail] - Optional secondary line rendered in bold (e.g. a filename)
     */
    _showSimple(variant, message, duration, detail) {
        const toast = this._createBaseToast(`md-toast-${variant}`);

        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'md-toast-icon-wrapper';
        iconWrapper.innerHTML = MD_TOAST_ICON_SVGS[variant]; // static constant, never user data

        const messageEl = document.createElement('span');
        messageEl.className = 'md-toast-msg';
        messageEl.textContent = String(message);

        if (detail !== undefined && detail !== null && detail !== '') {
            const detailEl = document.createElement('strong');
            detailEl.className = 'md-toast-detail';
            detailEl.textContent = String(detail);
            messageEl.appendChild(detailEl);
        }

        toast.append(iconWrapper, messageEl);
        this._animateAndSchedule(toast, duration);
    }

    /** @param {unknown} message @param {number} [duration] @param {unknown} [detail] */
    showInfo(message, duration = 3000, detail = null) {
        this._showSimple('info', message, duration, detail);
    }

    /** @param {unknown} message @param {number} [duration] @param {unknown} [detail] */
    showError(message, duration = 4000, detail = null) {
        this._showSimple('error', message, duration, detail);
    }

    /** @param {unknown} message @param {number} [duration] @param {unknown} [detail] */
    showSuccess(message, duration = 3000, detail = null) {
        this._showSimple('success', message, duration, detail);
    }

    /** @param {unknown} message @param {number} [duration] @param {unknown} [detail] */
    showWarning(message, duration = 3500, detail = null) {
        this._showSimple('warning', message, duration, detail);
    }

    /**
     * @param {unknown} href
     * @returns {string | null} the URL when it is absolute http(s), otherwise null (blocks javascript:, data:, …)
     */
    static _safeHttpUrl(href) {
        if (typeof href !== 'string' || !href) return null;
        try {
            const url = new URL(href, window.location.href);
            return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
        } catch (err) {
            console.warn('[MDToastManager] Rejected invalid action URL:', href, err);
            return null;
        }
    }

    /** @param {ComplexToastOptions} options */
    showComplex(options) {
        const { title, icon, body, action, onClose, onAction, duration = 8000 } = options;
        const toast = this._createBaseToast('md-toast-complex');

        const header = document.createElement('div');
        header.className = 'md-toast-header';

        if (title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'md-toast-title-text';
            if (icon) {
                const iconEl = document.createElement('span');
                iconEl.className = 'md-toast-icon';
                iconEl.textContent = String(icon);
                titleEl.appendChild(iconEl);
            }
            const titleTextEl = document.createElement('span');
            titleTextEl.textContent = String(title);
            titleEl.appendChild(titleTextEl);
            header.appendChild(titleEl);
        }

        const closeBtn = document.createElement('div');
        closeBtn.className = 'md-toast-close';
        closeBtn.textContent = '✕';
        header.appendChild(closeBtn);
        toast.appendChild(header);

        if (body) {
            const bodyEl = document.createElement('div');
            bodyEl.className = 'md-toast-body';
            bodyEl.textContent = String(body);
            toast.appendChild(bodyEl);
        }

        /** @type {HTMLElement | null} */
        let actionEl = null;
        if (action && action.label) {
            const safeHref = MDToastManager._safeHttpUrl(action.href);
            actionEl = document.createElement(safeHref ? 'a' : 'div');
            actionEl.className = 'md-toast-action-btn';
            if (safeHref) {
                actionEl.setAttribute('href', safeHref);
                actionEl.setAttribute('target', '_blank');
                actionEl.setAttribute('rel', 'noopener noreferrer'); // the opened page cannot reach window.opener
            }
            const labelEl = document.createElement('span');
            labelEl.textContent = String(action.label);
            actionEl.appendChild(labelEl);

            const actionSection = document.createElement('div');
            actionSection.className = 'md-toast-action-section';
            actionSection.appendChild(actionEl);
            toast.appendChild(actionSection);
        }

        const closeFunc = this._animateAndSchedule(toast, duration);

        closeBtn.onclick = (e) => {
            e.stopPropagation();
            if (onClose) onClose();
            closeFunc();
        };

        if (actionEl && onAction) {
            actionEl.onclick = (e) => {
                e.stopPropagation();
                if (onAction(e) !== false) closeFunc();
            };
        }
    }
}

// Expose globally to all content scripts
window.MDToastManager = new MDToastManager();
