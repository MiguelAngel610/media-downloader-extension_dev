document.addEventListener('DOMContentLoaded', () => {
    const downloadBtn = document.getElementById('download-btn');
    const urlInput = document.getElementById('url-input');
    const statusMsg = document.getElementById('status-message');

    // Load saved toggle states
    chrome.storage.local.get(['vanishMode', 'ghostOnline', 'ghostSeen', 'fb_ghost_seen', 'fb_ghost_presence', 'globalShortcutObj'], function(result) {
        if (result.vanishMode) document.getElementById('vanish-toggle').checked = true;
        if (result.ghostOnline) document.getElementById('ghost-online-toggle').checked = true;
        if (result.ghostSeen) document.getElementById('ghost-seen-toggle').checked = true;
        if (result.fb_ghost_seen) document.getElementById('fb-ghost-seen-toggle').checked = true;
        if (result.fb_ghost_presence) document.getElementById('fb-ghost-presence-toggle').checked = true;
        if (result.globalShortcutObj) document.getElementById('global-shortcut').value = result.globalShortcutObj.display;
    });

    // Tab Switching Logic
    const tabs = ['ig', 'fb', 'x', 'tg'];
    tabs.forEach(tab => {
        const btn = document.getElementById(`tab-btn-${tab}`);
        if (btn) {
            btn.addEventListener('click', () => {
                tabs.forEach(t => {
                    document.getElementById(`tab-btn-${t}`).classList.remove('active');
                    document.getElementById(`${t}-settings`).classList.add('hidden');
                });
                btn.classList.add('active');
                document.getElementById(`${tab}-settings`).classList.remove('hidden');
            });
        }
    });

    // Toggle handlers
    document.getElementById('vanish-toggle').addEventListener('change', (e) => {
        chrome.storage.local.set({ vanishMode: e.target.checked });
    });

    document.getElementById('ghost-online-toggle').addEventListener('change', (e) => {
        chrome.storage.local.set({ ghostOnline: e.target.checked });
        notifyInstagram({ type: 'MD_UPDATE_SETTINGS', ghostOnline: e.target.checked });
    });

    document.getElementById('ghost-seen-toggle').addEventListener('change', (e) => {
        chrome.storage.local.set({ ghostSeen: e.target.checked });
        notifyInstagram({ type: 'MD_UPDATE_SETTINGS', ghostSeen: e.target.checked });
    });

    document.getElementById('fb-ghost-seen-toggle').addEventListener('change', (e) => {
        chrome.storage.local.set({ fb_ghost_seen: e.target.checked });
    });

    document.getElementById('fb-ghost-presence-toggle').addEventListener('change', (e) => {
        chrome.storage.local.set({ fb_ghost_presence: e.target.checked });
    });

    // Global Shortcut Input Handler
    const globalShortcutInput = document.getElementById('global-shortcut');
    
    // Format display text properly (e.g. "Numpad 5", "D", "Space")
    const formatDisplayKey = (e) => {
        if (e.code.startsWith('Numpad')) return 'Numpad ' + e.key;
        if (e.code.startsWith('Key') || e.code.startsWith('Digit')) return e.key.toUpperCase();
        if (e.key === ' ') return 'Space';
        return e.key.toUpperCase();
    };

    globalShortcutInput.addEventListener('keydown', (e) => {
        e.preventDefault();
        
        // Handle Backspace/Delete to clear
        if (e.key === 'Backspace' || e.key === 'Delete') {
            globalShortcutInput.value = '';
            chrome.storage.local.set({ globalShortcutObj: null }, () => {
                showStatus('Global shortcut cleared!', 'success');
                setTimeout(() => { statusMsg.textContent = ''; }, 1000);
            });
            return;
        }

        // Prevent Tab or modifiers alone
        if (['Alt', 'Control', 'Shift', 'Meta', 'Tab'].includes(e.key)) return;

        // Create the shortcut object
        const shortcutData = {
            code: e.code,      // Strict match (e.g., Numpad5)
            key: e.key,        // Fallback match (e.g., 5)
            display: formatDisplayKey(e)
        };

        globalShortcutInput.value = shortcutData.display;

        chrome.storage.local.set({ globalShortcutObj: shortcutData }, () => {
            showStatus('Global shortcut updated!', 'success');
            setTimeout(() => { statusMsg.textContent = ''; }, 1000);
        });
    });

    function notifyInstagram(msg) {
        chrome.tabs.query({ url: "*://*.instagram.com/*" }, function(tabs) {
            for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
            }
        });
    }

    // Auto-fill URL on supported sites
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (!tabs || !tabs[0]) return;
        const url = tabs[0].url || '';
        if (url.includes("instagram.com") || url.includes("facebook.com") ||
            url.includes("twitter.com") || url.includes("x.com") || url.includes("telegram.org")) {
            urlInput.value = url;
        }
    });

    function showStatus(msg, type) {
        statusMsg.textContent = msg;
        statusMsg.className = `status ${type}`;
    }

    downloadBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) {
            showStatus("Please enter a valid link.", "error");
            return;
        }

        downloadBtn.disabled = true;
        downloadBtn.innerHTML = `<svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Processing...`;

        chrome.runtime.sendMessage({
            action: "download",
            url: url,
            mediaType: "auto",
            platform: "auto"
        }, (response) => {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download`;

            if (chrome.runtime.lastError || !response || response.status === "error") {
                showStatus(response?.message || "Error connecting to Native Host.", "error");
            } else if (response.status === "skipped") {
                showStatus("File already downloaded.", "success");
            } else {
                showStatus("Download started successfully.", "success");
            }
        });
    });

    // Ghost History Logic
    const btnHistory = document.getElementById('btn-ghost-history');
    const historyContainer = document.getElementById('ghost-history-container');
    const historyList = document.getElementById('ghost-history-list');
    const btnClearHistory = document.getElementById('btn-clear-ghost-history');

    if (btnHistory && historyContainer) {
        function renderGhostHistory() {
            chrome.storage.local.get(['ghostHistory'], function(result) {
                let history = result.ghostHistory || {};
                let users = Object.keys(history).sort((a, b) => history[b] - history[a]);
                
                if (users.length === 0) {
                    historyList.innerHTML = '<div style="text-align:center; padding: 10px; color: var(--text-secondary);">No stories viewed yet.</div>';
                    return;
                }
                
                historyList.innerHTML = users.map(u => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--border);">
                        <a href="https://www.instagram.com/${u}/" target="_blank" style="color: var(--text-primary); text-decoration: none; font-weight: 500;">@${u}</a>
                        <span style="color: var(--text-secondary); font-size: 10px;">${new Date(history[u]).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                `).join('');
            });
        }

        btnHistory.addEventListener('click', () => {
            if (historyContainer.style.display === 'none') {
                historyContainer.style.display = 'block';
                btnHistory.innerText = 'Hide Ghost History 👻';
                renderGhostHistory();
            } else {
                historyContainer.style.display = 'none';
                btnHistory.innerText = 'View Ghost History 👀';
            }
        });

        if (btnClearHistory) {
            btnClearHistory.addEventListener('click', () => {
                chrome.storage.local.set({ ghostHistory: {} }, () => {
                    renderGhostHistory();
                });
            });
        }
    }
});
