// src/telegram/ui/progress_toast.js
(function() {
    class TelegramProgressToastManager {
        constructor() {
            this.repositionTimer = null;
        }

        getOrCreateContainer() {
            let container = document.getElementById("tel-downloader-progress-bar-container");
            if (!container) {
                container = document.createElement("div");
                container.id = "tel-downloader-progress-bar-container";
            }
            this.repositionContainer(container);
            return container;
        }

        repositionContainer(container) {
            if (!container) return;

            if (container.children.length === 0) {
                if (this.repositionTimer) {
                    clearInterval(this.repositionTimer);
                    this.repositionTimer = null;
                }
                return;
            }

            const candidates = Array.from(document.querySelectorAll("#MediaViewer, .media-viewer-whole, #StoryViewer, #stories-viewer, .MediaViewer, .StoryViewer, [role='dialog'], .modal-container, .popup-container"));
            const isVisible = (el) => {
                if (!el || !document.body.contains(el)) return false;
                const style = window.getComputedStyle(el);
                if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) <= 0.01) return false;
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            };
            const activeOverlays = candidates.filter(isVisible);
            // Mount inside active fullscreen element or inside the topmost active Telegram modal; fallback to body
            const targetParent = document.fullscreenElement || (activeOverlays.length > 0 ? activeOverlays[activeOverlays.length - 1] : document.body);

            if (targetParent && (container.parentElement !== targetParent || container.nextElementSibling !== null)) {
                targetParent.appendChild(container);
            }
        }

        activateContainer(container) {
            this.repositionContainer(container);
            if (!this.repositionTimer && container.children.length > 0) {
                this.repositionTimer = setInterval(() => {
                    const el = document.getElementById("tel-downloader-progress-bar-container");
                    if (el) this.repositionContainer(el);
                }, 300);
            }
        }

        setupAutoClose(el) {
            if (el.__md_tel_autoCloseTimeout) {
                clearTimeout(el.__md_tel_autoCloseTimeout);
            }

            const startTimer = () => {
                el.__md_tel_autoCloseTimeout = setTimeout(() => {
                    el.classList.remove('show');
                    setTimeout(() => {
                        const parent = el.parentNode;
                        if (parent) {
                            parent.removeChild(el);
                            this.repositionContainer(parent);
                        }
                    }, 400); // Wait for CSS transition
                }, 3000);
            };

            const stopTimer = () => {
                if (el.__md_tel_autoCloseTimeout) {
                    clearTimeout(el.__md_tel_autoCloseTimeout);
                    el.__md_tel_autoCloseTimeout = null;
                }
            };

            el.addEventListener("mouseenter", stopTimer);
            el.addEventListener("mouseleave", startTimer);

            startTimer();
        }

        createProgressBar(videoId, fileName) {
            const container = this.getOrCreateContainer();

            const toast = document.createElement("div");
            toast.id = "tel-downloader-progress-" + videoId;
            toast.className = "tel-downloader-progress-toast";
            
            toast.innerHTML = `
                <div class="tel-downloader-progress-header">
                    <p class="tel-downloader-progress-title" title="${fileName}">${fileName}</p>
                    <div class="tel-downloader-progress-close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </div>
                </div>
                <div class="tel-downloader-progress-track">
                    <div class="tel-downloader-progress-fill"></div>
                    <p class="tel-downloader-progress-text">0%</p>
                </div>
            `;

            const closeButton = toast.querySelector(".tel-downloader-progress-close");
            closeButton.onclick = () => {
                toast.classList.remove('show');
                setTimeout(() => {
                    const parent = toast.parentNode;
                    if (parent) {
                        parent.removeChild(toast);
                        this.repositionContainer(parent);
                    }
                }, 400);
            };

            container.appendChild(toast);
            this.activateContainer(container);
            
            // Trigger animation
            requestAnimationFrame(() => {
                toast.classList.add("show");
            });
        }

        updateProgress(videoId, fileName, progress) {
            this.getOrCreateContainer();
            const toast = document.getElementById("tel-downloader-progress-" + videoId);
            if (!toast) return;
            
            toast.querySelector(".tel-downloader-progress-title").innerText = fileName;
            toast.querySelector(".tel-downloader-progress-text").innerText = progress + "%";
            toast.querySelector(".tel-downloader-progress-fill").style.width = progress + "%";
        }

        completeProgress(videoId) {
            this.getOrCreateContainer();
            const toast = document.getElementById("tel-downloader-progress-" + videoId);
            if (!toast) return;
            
            toast.classList.add("success");
            toast.querySelector(".tel-downloader-progress-text").innerText = "Completed";
            toast.querySelector(".tel-downloader-progress-fill").style.width = "100%";
            
            this.setupAutoClose(toast);
        }

        abortProgress(videoId) {
            this.getOrCreateContainer();
            const toast = document.getElementById("tel-downloader-progress-" + videoId);
            if (!toast) return;
            
            toast.classList.add("error");
            toast.querySelector(".tel-downloader-progress-text").innerText = "Aborted";
            toast.querySelector(".tel-downloader-progress-fill").style.width = "100%";
            
            this.setupAutoClose(toast);
        }
    }

    const toastManager = new TelegramProgressToastManager();

    // Export to window for backwards compatibility with the rest of the codebase
    window.__md_tel_createProgressBar = (videoId, fileName) => toastManager.createProgressBar(videoId, fileName);
    window.__md_tel_updateProgress = (videoId, fileName, progress) => toastManager.updateProgress(videoId, fileName, progress);
    window.__md_tel_completeProgress = (videoId) => toastManager.completeProgress(videoId);
    window.__md_tel_AbortProgress = (videoId) => toastManager.abortProgress(videoId);
    
    window.__md_tel_showToast = (message, isError = false) => {
        if (window.MDToastManager) {
            if (isError) window.MDToastManager.showError(message);
            else window.MDToastManager.showInfo(message);
        }
    };
})();
