/** Instagram's own username rules: letters, digits, dots and underscores, max 30 chars. */
const INSTAGRAM_USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const downloadBtn = document.getElementById('download-btn');
    const urlInput = document.getElementById('url-input');
    const pasteBtn = document.getElementById('paste-btn');
    const statusMsg = document.getElementById('status-message');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const globalShortcutInput = document.getElementById('global-shortcut');
    const shortcutBox = document.getElementById('shortcut-box');
    const clearShortcutBtn = document.getElementById('clear-shortcut-btn');

    // --- Theme Management (Light Mode Default) ---
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (themeToggleBtn) {
            themeToggleBtn.setAttribute('title', theme === 'dark' ? 'Cambiar a Modo Blanco' : 'Cambiar a Modo Oscuro');
        }
    }

    chrome.storage.local.get(['popupTheme'], (result) => {
        const savedTheme = result.popupTheme || 'light'; // Default to light mode (Modo Blanco)
        applyTheme(savedTheme);
    });

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            chrome.storage.local.set({ popupTheme: next });
        });
    }

    // --- Load saved toggle states ---
    chrome.storage.local.get(['vanishMode', 'ghostOnline', 'ghostSeen', 'fb_ghost_seen', 'fb_ghost_presence', 'globalShortcutObj', 'ghostHistory'], function(result) {
        if (result.vanishMode) document.getElementById('vanish-toggle').checked = true;
        if (result.ghostOnline) document.getElementById('ghost-online-toggle').checked = true;
        if (result.ghostSeen) document.getElementById('ghost-seen-toggle').checked = true;
        if (result.fb_ghost_seen) document.getElementById('fb-ghost-seen-toggle').checked = true;
        if (result.fb_ghost_presence) document.getElementById('fb-ghost-presence-toggle').checked = true;
        if (result.globalShortcutObj && result.globalShortcutObj.display) {
            globalShortcutInput.value = result.globalShortcutObj.display;
        }

        // Update Ghost History Badge
        updateGhostHistoryBadge(result.ghostHistory || {});
    });

    // --- Tab Switching Logic (Accessible Tabs) ---
    const tabs = ['ig', 'fb', 'x', 'tg'];
    tabs.forEach(tab => {
        const btn = document.getElementById(`tab-btn-${tab}`);
        const panel = document.getElementById(`${tab}-settings`);
        if (btn && panel) {
            btn.addEventListener('click', () => {
                tabs.forEach(t => {
                    const b = document.getElementById(`tab-btn-${t}`);
                    const p = document.getElementById(`${t}-settings`);
                    if (b) {
                        b.classList.remove('active');
                        b.setAttribute('aria-selected', 'false');
                    }
                    if (p) p.classList.add('hidden');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                panel.classList.remove('hidden');
            });
        }
    });

    // --- Toggle Handlers with Card Click Propagation ---
    function wireToggle(switchId, storageKey, onToggleCallback) {
        const input = document.getElementById(switchId);
        if (!input) return;

        input.addEventListener('change', (e) => {
            const checked = e.target.checked;
            chrome.storage.local.set({ [storageKey]: checked });
            if (onToggleCallback) onToggleCallback(checked);
        });

        // Click anywhere on the card to toggle (Intuitive UX)
        const parentCard = input.closest('.toggle-card');
        if (parentCard) {
            parentCard.addEventListener('click', (e) => {
                if (e.target !== input && !e.target.closest('.switch')) {
                    input.checked = !input.checked;
                    input.dispatchEvent(new Event('change'));
                }
            });
        }
    }

    wireToggle('vanish-toggle', 'vanishMode');
    wireToggle('ghost-online-toggle', 'ghostOnline', (checked) => {
        notifyInstagram({ type: 'MD_UPDATE_SETTINGS', ghostOnline: checked });
    });
    wireToggle('ghost-seen-toggle', 'ghostSeen', (checked) => {
        notifyInstagram({ type: 'MD_UPDATE_SETTINGS', ghostSeen: checked });
    });
    wireToggle('fb-ghost-seen-toggle', 'fb_ghost_seen');
    wireToggle('fb-ghost-presence-toggle', 'fb_ghost_presence');

    function notifyInstagram(msg) {
        chrome.tabs.query({ url: "*://*.instagram.com/*" }, function(tabs) {
            for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
            }
        });
    }

    // --- Universal Shortcut Recorder ---
    const formatDisplayKey = (e) => {
        if (e.code.startsWith('Numpad')) return 'Numpad ' + e.key;
        if (e.code.startsWith('Key') || e.code.startsWith('Digit')) return e.key.toUpperCase();
        if (e.key === ' ') return 'Space';
        return e.key.toUpperCase();
    };

    if (globalShortcutInput && shortcutBox) {
        let isRecording = false;

        shortcutBox.addEventListener('click', () => {
            if (!isRecording) {
                isRecording = true;
                shortcutBox.classList.add('recording');
                globalShortcutInput.value = 'Pulsa tecla...';
                globalShortcutInput.focus();
            }
        });

        globalShortcutInput.addEventListener('keydown', (e) => {
            e.preventDefault();

            // Clear shortcut
            if (e.key === 'Backspace' || e.key === 'Delete') {
                globalShortcutInput.value = '';
                shortcutBox.classList.remove('recording');
                isRecording = false;
                chrome.storage.local.set({ globalShortcutObj: null });
                showStatus('Atajo eliminado', 'success');
                setTimeout(() => { statusMsg.classList.add('hidden'); }, 1200);
                return;
            }

            // Disallow modifier keys alone
            if (['Alt', 'Control', 'Shift', 'Meta', 'Tab'].includes(e.key)) return;

            const shortcutData = {
                code: e.code,
                key: e.key,
                display: formatDisplayKey(e)
            };

            globalShortcutInput.value = shortcutData.display;
            shortcutBox.classList.remove('recording');
            isRecording = false;

            chrome.storage.local.set({ globalShortcutObj: shortcutData }, () => {
                showStatus(`Atajo guardado: ${shortcutData.display}`, 'success');
                setTimeout(() => { statusMsg.classList.add('hidden'); }, 1500);
            });
        });

        globalShortcutInput.addEventListener('blur', () => {
            if (isRecording) {
                isRecording = false;
                shortcutBox.classList.remove('recording');
                chrome.storage.local.get(['globalShortcutObj'], (res) => {
                    globalShortcutInput.value = res.globalShortcutObj ? res.globalShortcutObj.display : '';
                });
            }
        });

        if (clearShortcutBtn) {
            clearShortcutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                globalShortcutInput.value = '';
                shortcutBox.classList.remove('recording');
                isRecording = false;
                chrome.storage.local.set({ globalShortcutObj: null });
                showStatus('Atajo eliminado', 'success');
                setTimeout(() => { statusMsg.classList.add('hidden'); }, 1200);
            });
        }
    }

    // --- Clipboard Paste Helper ---
    if (pasteBtn && urlInput) {
        pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    urlInput.value = text.trim();
                    urlInput.focus();
                    showStatus('Enlace pegado', 'success');
                    setTimeout(() => { statusMsg.classList.add('hidden'); }, 1200);
                }
            } catch (err) {
                urlInput.focus();
                document.execCommand('paste');
            }
        });
    }

    // --- Auto-fill URL on supported sites ---
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (!tabs || !tabs[0]) return;
        const url = tabs[0].url || '';
        if (url.includes("instagram.com") || url.includes("facebook.com") ||
            url.includes("twitter.com") || url.includes("x.com") || url.includes("telegram.org")) {
            urlInput.value = url;
        }
    });

    // --- Status Helper ---
    function showStatus(msg, type) {
        statusMsg.textContent = msg;
        statusMsg.className = `status-alert ${type}`;
        statusMsg.classList.remove('hidden');
    }

    // --- Download Trigger ---
    downloadBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) {
            showStatus("Por favor ingresa un enlace válido.", "error");
            return;
        }

        downloadBtn.disabled = true;
        downloadBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
                <line x1="12" y1="2" x2="12" y2="6"></line>
                <line x1="12" y1="18" x2="12" y2="22"></line>
                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                <line x1="2" y1="12" x2="6" y2="12"></line>
                <line x1="18" y1="12" x2="22" y2="12"></line>
                <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
            </svg>
            <span>Procesando...</span>
        `;

        chrome.runtime.sendMessage({
            action: "download",
            url: url,
            mediaType: "auto",
            platform: "auto"
        }, (response) => {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Descargar Ahora</span>
            `;

            if (chrome.runtime.lastError || !response || response.status === "error") {
                showStatus(response?.message || "Error al conectar con el Host Nativo.", "error");
            } else if (response.status === "skipped") {
                showStatus("El archivo ya existe en tu PC.", "success");
            } else {
                showStatus("Descarga iniciada con éxito.", "success");
            }
        });
    });

    // --- Ghost History Management ---
    const btnHistory = document.getElementById('btn-ghost-history');
    const historyContainer = document.getElementById('ghost-history-container');
    const historyList = document.getElementById('ghost-history-list');
    const btnClearHistory = document.getElementById('btn-clear-ghost-history');
    const historyBadge = document.getElementById('ghost-history-badge');

    function updateGhostHistoryBadge(history) {
        if (!historyBadge) return;
        const count = Object.keys(history).length;
        historyBadge.textContent = count;
        historyBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    if (btnHistory && historyContainer) {
        function renderGhostHistory() {
            chrome.storage.local.get(['ghostHistory'], function(result) {
                const history = result.ghostHistory || {};
                const users = Object.keys(history).sort((a, b) => history[b] - history[a]);
                updateGhostHistoryBadge(history);

                // Usernames come from storage written by a content script: render with DOM APIs, never innerHTML.
                const validUsers = users.filter((u) => INSTAGRAM_USERNAME_PATTERN.test(u));
                historyList.replaceChildren();

                if (validUsers.length === 0) {
                    const emptyEl = document.createElement('div');
                    emptyEl.style.cssText = 'text-align:center; padding: 12px; color: var(--text-muted); font-size: 11px;';
                    emptyEl.textContent = 'No hay historias vistas en sigilo.';
                    historyList.appendChild(emptyEl);
                    return;
                }

                for (const username of validUsers) {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'history-item';

                    const linkEl = document.createElement('a');
                    linkEl.href = `https://www.instagram.com/${encodeURIComponent(username)}/`;
                    linkEl.target = '_blank';
                    linkEl.rel = 'noopener noreferrer';
                    linkEl.textContent = `@${username}`;

                    const timeEl = document.createElement('span');
                    timeEl.className = 'history-time';
                    timeEl.textContent = new Date(history[username]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    itemEl.append(linkEl, timeEl);
                    historyList.appendChild(itemEl);
                }
            });
        }

        btnHistory.addEventListener('click', () => {
            const isClosed = historyContainer.style.display === 'none';
            historyContainer.style.display = isClosed ? 'block' : 'none';
            if (isClosed) renderGhostHistory();
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
