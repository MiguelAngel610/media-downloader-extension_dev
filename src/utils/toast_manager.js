// src/utils/toast_manager.js

class MDToastManager {
    constructor() {
        this.currentToast = null;
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

    _createBaseToast(className) {
        this._removeCurrentToast();
        const toast = document.createElement('div');
        toast.className = `md-toast ${className}`;
        this.currentToast = toast;
        return toast;
    }

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

    showInfo(message, duration = 3000) {
        const toast = this._createBaseToast('md-toast-info');
        toast.innerText = message;
        this._animateAndSchedule(toast, duration);
    }

    showError(message, duration = 4000) {
        const toast = this._createBaseToast('md-toast-error');
        toast.innerText = message;
        this._animateAndSchedule(toast, duration);
    }

    showWarning(message, duration = 3500) {
        const toast = this._createBaseToast('md-toast-warning');
        toast.innerText = message;
        this._animateAndSchedule(toast, duration);
    }

    showComplex(options) {
        const { title, icon, body, actionHtml, onClose, onAction, duration = 8000 } = options;
        const toast = this._createBaseToast('md-toast-complex');

        const headerIcon = icon ? `<span class="md-toast-icon">${icon}</span>` : '';
        const titleHtml = title ? `<div class="md-toast-title-text">${headerIcon}<span>${title}</span></div>` : '';
        const bodyHtml = body ? `<div class="md-toast-body">${body}</div>` : '';
        const actionSection = actionHtml ? `<div class="md-toast-action-section">${actionHtml}</div>` : '';

        toast.innerHTML = `
            <div class="md-toast-header">
                ${titleHtml}
                <div class="md-toast-close">✕</div>
            </div>
            ${bodyHtml}
            ${actionSection}
        `;

        const closeBtn = toast.querySelector('.md-toast-close');
        const closeFunc = this._animateAndSchedule(toast, duration);

        closeBtn.onclick = (e) => {
            e.stopPropagation();
            if (onClose) onClose();
            closeFunc();
        };

        const actionElement = toast.querySelector('.md-toast-action-section > *');
        if (actionElement && onAction) {
            actionElement.onclick = (e) => {
                e.stopPropagation();
                if (onAction(e) !== false) closeFunc();
            };
        }
    }
}

// Expose globally to all content scripts
window.MDToastManager = new MDToastManager();
