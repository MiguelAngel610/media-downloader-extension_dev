import { mdLog, logError } from './logger.js';

/* Media Downloader - Ghost Settings (MAIN world)
 * Single source of truth for the stealth flags inside the page context.
 * The flags live in chrome.storage, which the MAIN world cannot read, so the
 * ISOLATED bridge (ig_interceptor_init.js) pushes typed snapshots here.
 * Until the first snapshot arrives the state is "unknown" and callers must
 * hold ghost-relevant traffic (fail-closed) instead of assuming "disabled". */

/** @typedef {{ vanishMode: boolean, ghostOnline: boolean, ghostSeen: boolean }} GhostSettings */

export const GHOST_SETTINGS_MESSAGE = 'MD_GHOST_SETTINGS';
export const GHOST_SETTINGS_REQUEST_MESSAGE = 'MD_GHOST_SETTINGS_REQUEST';

const SETTINGS_WAIT_WARNING_MS = 5000;

/** @type {Readonly<GhostSettings>} */
let currentSettings = Object.freeze({ vanishMode: false, ghostOnline: false, ghostSeen: false });
/** @type {boolean} */
let settingsReceived = false;
/** @type {() => void} */
let resolveSettingsReady = () => {};

/** Resolves once the first valid settings snapshot has been received. */
/** @type {Promise<void>} */
export const settingsReady = new Promise((resolve) => {
    resolveSettingsReady = resolve;
});

/** @returns {boolean} */
export function areSettingsReady() {
    return settingsReceived;
}

/** @returns {Readonly<GhostSettings>} */
export function getGhostSettings() {
    return currentSettings;
}

/**
 * @param {unknown} payload
 * @returns {GhostSettings | null}
 */
function parseSettings(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const { vanishMode, ghostOnline, ghostSeen } = /** @type {Record<string, unknown>} */ (payload);
    if (typeof vanishMode !== 'boolean' || typeof ghostOnline !== 'boolean' || typeof ghostSeen !== 'boolean') {
        return null;
    }
    return { vanishMode, ghostOnline, ghostSeen };
}

/**
 * @param {string} badge
 * @param {boolean} enabled
 * @param {string} enabledText
 * @param {string} color
 */
function logFlag(badge, enabled, enabledText, color) {
    mdLog(badge, enabled ? enabledText : 'Disabled', enabled ? color : '#64748b');
}

/** @param {GhostSettings} next */
function applySettings(next) {
    const previous = currentSettings;
    const isFirstSnapshot = !settingsReceived;
    currentSettings = Object.freeze(next);

    // Legacy mirrors still read by story_resume.js.
    window.__md_vanishMode = next.vanishMode;
    window.__md_ghostOnline = next.ghostOnline;
    window.__md_ghostSeen = next.ghostSeen;

    if (isFirstSnapshot || previous.vanishMode !== next.vanishMode) {
        logFlag('👻 Vanish Mode', next.vanishMode, 'Enabled — Stealth protocol active', '#8b5cf6');
    }
    if (isFirstSnapshot || previous.ghostOnline !== next.ghostOnline) {
        logFlag('🟢 Ghost Online', next.ghostOnline, 'Enabled — Presence concealed', '#10b981');
    }
    if (isFirstSnapshot || previous.ghostSeen !== next.ghostSeen) {
        logFlag('👀 Ghost Seen', next.ghostSeen, 'Enabled — View status hidden', '#3b82f6');
    }

    if (isFirstSnapshot) {
        settingsReceived = true;
        resolveSettingsReady();
    }
}

window.addEventListener('message', (event) => {
    // Only our own window (the ISOLATED bridge shares it) may change the flags;
    // this rejects openers, iframes and any other cross-window sender.
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.type !== GHOST_SETTINGS_MESSAGE) return;

    const parsed = parseSettings(data.settings);
    if (!parsed) {
        logError('Ghost Settings', new TypeError('Rejected malformed ghost settings payload'));
        return;
    }
    applySettings(parsed);
});

// Handshake: covers the case where the bridge broadcast before this listener existed.
// '/' restricts delivery to this same origin.
window.postMessage({ type: GHOST_SETTINGS_REQUEST_MESSAGE }, '/');

setTimeout(() => {
    if (!settingsReceived) {
        logError('Ghost Settings', new Error(`No settings received after ${SETTINGS_WAIT_WARNING_MS}ms — ghost-relevant requests stay on hold (fail-closed)`));
    }
}, SETTINGS_WAIT_WARNING_MS);
