// src/shared/utils/dom_observer.js

class MDObserverManager {
    constructor() {
        this.observer = null;
        this.pollIntervalId = null;
        this.isScheduled = false;
    }

    /**
     * Highly efficient DOM Observer using MutationObserver + requestAnimationFrame.
     * Prevents CPU lag by guaranteeing the callback only fires once per browser frame
     * regardless of how many thousands of mutations occurred.
     * 
     * @param {Function} callback - The function to execute on DOM change.
     * @param {Node} targetNode - The node to observe (defaults to document.documentElement).
     */
    observeDOM(callback, targetNode = document.documentElement) {
        if (this.observer) {
            this.observer.disconnect();
        }

        this.observer = new MutationObserver(() => {
            if (!this.isScheduled) {
                this.isScheduled = true;
                requestAnimationFrame(() => {
                    this.isScheduled = false;
                    try {
                        callback();
                    } catch (err) {
                        console.error("[MDObserverManager] Error in observeDOM callback:", err);
                    }
                });
            }
        });

        this.observer.observe(targetNode, { childList: true, subtree: true });
        
        // Initial manual trigger
        requestAnimationFrame(() => {
            try { callback(); } catch (err) { console.error("[MDObserverManager] Error in initial observeDOM callback:", err); }
        });
    }

    /**
     * Standard polling observer.
     * Best for heavy web apps (like Telegram WebK) where MutationObserver is too noisy.
     * 
     * @param {Function} callback - The function to execute on interval.
     * @param {number} intervalMs - Polling interval in milliseconds (defaults to 500ms).
     */
    pollDOM(callback, intervalMs = 500) {
        if (this.pollIntervalId) {
            clearInterval(this.pollIntervalId);
        }

        this.pollIntervalId = setInterval(() => {
            try {
                callback();
            } catch (err) {
                console.error("[MDObserverManager] Error in pollDOM callback:", err);
            }
        }, intervalMs);

        // Initial manual trigger
        try { callback(); } catch (err) { console.error("[MDObserverManager] Error in initial pollDOM callback:", err); }
    }

    disconnect() {
        if (this.observer) this.observer.disconnect();
        if (this.pollIntervalId) clearInterval(this.pollIntervalId);
        this.observer = null;
        this.pollIntervalId = null;
    }
}

// Expose globally
window.MDObserverManager = new MDObserverManager();
