// src/shared/utils/shortcut_manager.js

class MDShortcutManager {
    constructor() {
        this.currentShortcut = null;
        this.callbacks = [];
        this.init();
    }

    init() {
        // Load initial state
        chrome.storage.local.get(['globalShortcutObj'], (res) => {
            if (res.globalShortcutObj) {
                this.currentShortcut = res.globalShortcutObj;
            }
        });

        // Listen for updates from popup
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.globalShortcutObj) {
                this.currentShortcut = changes.globalShortcutObj.newValue || null;
            }
        });

        // Global keydown listener (Use capture phase to defeat React stopPropagation)
        window.addEventListener('keydown', (e) => {
            if (!this.currentShortcut) return;
            
            // Match logic: use code for precision (Numpad vs Digit), fallback to key
            let isMatch = false;
            
            if (this.currentShortcut.code && e.code) {
                isMatch = (e.code === this.currentShortcut.code);
            } else if (this.currentShortcut.key && e.key) {
                isMatch = (e.key.toLowerCase() === this.currentShortcut.key.toLowerCase());
            }

            if (!isMatch) return;

            // Ignore if typing in input, textarea, or content editable areas
            const el = document.activeElement;
            if (el && (
                el.tagName === 'INPUT' || 
                el.tagName === 'TEXTAREA' || 
                el.isContentEditable || 
                el.closest('[contenteditable="true"]')
            )) {
                if (window.MDToastManager) {
                    window.MDToastManager.showWarning("⚠️ Download shortcut blocked: Cursor is in a text box. Click outside to use it.");
                }
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            this.triggerCallbacks();
        }, true); // <-- true ensures we intercept before Instagram's React code can stop the event
    }

    onShortcutPressed(callback) {
        if (typeof callback === 'function') {
            this.callbacks.push(callback);
        }
    }

    triggerCallbacks() {
        this.callbacks.forEach(cb => {
            try {
                cb();
            } catch (err) {
                console.error("Shortcut callback error:", err);
            }
        });
    }
}

// Expose globally to all content scripts
window.ShortcutManager = new MDShortcutManager();
