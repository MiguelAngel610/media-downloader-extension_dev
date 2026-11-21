/* Media Downloader - IG Interceptor Bridge (ISOLATED world)
 * The interceptor bundle (dist/ig_interceptor.bundle.js) is injected by the manifest
 * into the MAIN world at document_start, before any Instagram script runs.
 * This bridge forwards the stealth settings from chrome.storage to it and relays
 * page-world results back into the content-script state. */

const GHOST_SETTINGS_MESSAGE = 'MD_GHOST_SETTINGS';
const GHOST_SETTINGS_REQUEST_MESSAGE = 'MD_GHOST_SETTINGS_REQUEST';
const GHOST_SETTING_KEYS = Object.freeze(['vanishMode', 'ghostOnline', 'ghostSeen']);

const GHOST_HISTORY_KEY = 'ghostHistory';
const GHOST_HISTORY_TTL_MS = 48 * 60 * 60 * 1000;
const INSTAGRAM_USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

/**
 * Reads the persisted ghost flags and pushes one complete, typed snapshot to the MAIN world.
 * Always sends all three flags so the MAIN world can leave its fail-closed state.
 */
function broadcastGhostSettings() {
    try {
        chrome.storage.local.get([...GHOST_SETTING_KEYS], (result) => {
            if (chrome.runtime.lastError) {
                console.error('[MD Ghost] Failed to read ghost settings:', chrome.runtime.lastError.message);
                return;
            }
            /** @type {{ vanishMode: boolean, ghostOnline: boolean, ghostSeen: boolean }} */
            const settings = {
                vanishMode: result.vanishMode === true,
                ghostOnline: result.ghostOnline === true,
                ghostSeen: result.ghostSeen === true,
            };
            // '/' restricts delivery to this same origin.
            window.postMessage({ type: GHOST_SETTINGS_MESSAGE, settings }, '/');
        });
    } catch (err) {
        // Thrown when the extension was reloaded and this script's context is invalidated.
        console.error('[MD Ghost] Cannot broadcast ghost settings:', err);
    }
}

/**
 * Persists a stealth-viewed story owner for the popup history (48h retention).
 * @param {unknown} username
 * @param {unknown} timestamp
 */
function recordGhostHistory(username, timestamp) {
    if (typeof username !== 'string' || !INSTAGRAM_USERNAME_PATTERN.test(username)) {
        console.warn('[MD Ghost] Ignored ghost history entry with invalid username:', username);
        return;
    }
    const seenAt = typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : Date.now();
    try {
        chrome.storage.local.get([GHOST_HISTORY_KEY], (result) => {
            if (chrome.runtime.lastError) {
                console.error('[MD Ghost] Failed to read ghost history:', chrome.runtime.lastError.message);
                return;
            }
            /** @type {Record<string, number>} */
            const history = result[GHOST_HISTORY_KEY] && typeof result[GHOST_HISTORY_KEY] === 'object' ? result[GHOST_HISTORY_KEY] : {};
            const now = Date.now();
            for (const user of Object.keys(history)) {
                if (typeof history[user] !== 'number' || now - history[user] > GHOST_HISTORY_TTL_MS) delete history[user];
            }
            history[username] = seenAt;
            chrome.storage.local.set({ [GHOST_HISTORY_KEY]: history }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[MD Ghost] Failed to save ghost history:', chrome.runtime.lastError.message);
                }
            });
        });
    } catch (err) {
        console.error('[MD Ghost] Cannot record ghost history:', err);
    }
}

broadcastGhostSettings();

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;
    if (GHOST_SETTING_KEYS.some((key) => key in changes)) broadcastGhostSettings();
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'MD_UPDATE_SETTINGS') {
        // storage.onChanged also fires; re-broadcasting the full snapshot keeps both paths consistent.
        broadcastGhostSettings();
    }
    if (msg.action === 'host_response' && msg.response) {
        if (msg.response.status === 'error' && window.MDToastManager) {
            window.MDToastManager.showError("Host Error: " + (msg.response.message || "Unknown error"));
        } else if (msg.response.status === 'success' && window.MDToastManager) {
            // The filename comes from the host (and ultimately from page metadata): passed as plain-text detail.
            window.MDToastManager.showSuccess("✅ Download completed!", 4000, msg.response.filename);
        } else if (msg.response.status === 'skipped' && window.MDToastManager) {
            window.MDToastManager.showInfo("⏭️ File already exists", 3000, msg.response.filename);
        }
    }
});

window.addEventListener('message', function(event) {
    if (event.source !== window || !event.data) return;
    if (event.data.type === GHOST_SETTINGS_REQUEST_MESSAGE) {
        broadcastGhostSettings();
    }
    if (event.data.type === 'MD_GHOST_HISTORY_ADD') {
        recordGhostHistory(event.data.username, event.data.timestamp);
    }
    if (event.data.type === 'MD_STORY_MEDIA_UPDATE') {
        Object.assign(window.__md_storyMediaDict, event.data.media);
        console.log("Media Downloader: Updated internal dictionary. Total items:", Object.keys(window.__md_storyMediaDict).length);
    }
    if (event.data.type === 'MD_FIBER_RESULT') {
        window.__md_fiberResults = window.__md_fiberResults || {};
        window.__md_fiberResults[event.data.id] = { url: event.data.url, dash_manifest: event.data.dash, media_id: event.data.media_id, index: event.data.index, shortcode: event.data.shortcode, user: event.data.user, time: event.data.time };
    }
    if (event.data.type === 'MD_PFP_RESULT') {
        window.__md_pfpResults = window.__md_pfpResults || {};
        window.__md_pfpResults[event.data.username] = event.data.url;
    }
    if (event.data.type === 'MD_PFPS_DICT_UPDATE') {
        try {
            event.data.urls.forEach(url => window.__md_pfps_list.add(url));
        } catch (err) {
            console.error('[MD] Failed to merge HD profile picture URLs:', err);
        }
    }
});
