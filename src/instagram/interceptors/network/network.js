import { mdLog, logError } from '../shared/logger.js';
import { showGhostToast, handleGhostBlock } from '../ghost/ghost_mode.js';
import { extractSignatureFromUrl, processAndPostData } from '../media/media_parser.js';
import { areSettingsReady, getGhostSettings, settingsReady } from '../ghost/ghost_settings.js';
import { NOT_BLOCKED, classifyRequest, decideGhostBlock, isGhostRelevant, isWebSocketPresencePayload } from '../ghost/ghost_policy.js';
import { decodeWebSocketPayload, normalizeRequestUrl, readBodyTextAsync, readBodyTextSync, readFetchBodyText } from './request_body.js';

/* Media Downloader - Network Interception (MAIN world)
 * Runs at document_start (manifest "world": "MAIN"), before any Instagram script,
 * so the page can never keep a reference to the unpatched fetch/XHR/WebSocket.
 * Ghost-relevant requests issued before the settings snapshot arrives are held
 * until it does (fail-closed); all other traffic passes through untouched. */

/** @typedef {import('./ghost_policy.js').GhostDecision} GhostDecision */

const SNIFFABLE_URL_MARKERS = Object.freeze(['graphql', 'reels_media', 'feed/reels', '/api/v1/', '?__a=1']);
/** Only textual payloads are worth sniffing; video/image segments would be decoded for nothing. */
const TEXTUAL_CONTENT_TYPE = /json|javascript|text\/|html/i;

/** @returns {Promise<never>} Keeps the caller pending forever so the app never sees a failure it could retry. */
function neverSettles() {
    return new Promise(() => {});
}

/**
 * @param {string} url
 * @param {string} bodyText
 * @returns {Promise<Readonly<GhostDecision>>}
 */
async function resolveGhostDecision(url, bodyText) {
    const classification = classifyRequest(url, bodyText);
    if (!isGhostRelevant(classification)) return NOT_BLOCKED;
    if (!areSettingsReady()) await settingsReady;
    return decideGhostBlock(classification, getGhostSettings());
}

/**
 * @param {Readonly<GhostDecision>} decision
 * @param {string} channel - Fetch | XHR | Beacon
 */
function reportBlocked(decision, channel) {
    if (decision.type === 'presence') {
        mdLog('🟢 Presence Shield', `Blocked ${channel} request to broadcast presence (status offline)`, '#10b981');
        showGhostToast('🟢', '#064e3b');
        return;
    }
    handleGhostBlock(decision.type, decision.username);
}

// ==========================================
// Response sniffing (media dictionary + HD profile pictures)
// ==========================================

/**
 * @param {string} url
 * @param {string} text
 */
function sniffResponseText(url, text) {
    if (!text) return;
    const urlLower = url.toLowerCase();
    if (!SNIFFABLE_URL_MARKERS.some((marker) => urlLower.includes(marker))) return;
    try {
        processAndPostData(JSON.parse(text));
    } catch (err) {
        // SyntaxError is expected: many matching endpoints return non-JSON payloads.
        if (!(err instanceof SyntaxError)) logError('Response Sniffer', err);
    }
}

/**
 * @param {string} url
 * @param {Response} response
 */
function inspectFetchResponse(url, response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !TEXTUAL_CONTENT_TYPE.test(contentType)) return;
    response.clone().text()
        .then((text) => sniffResponseText(url, text))
        .catch((err) => logError('Fetch Sniffer', err));
}

// ==========================================
// fetch
// ==========================================
const originalFetch = window.fetch;

window.fetch = async function (...args) {
    const [input, init] = args;
    const url = normalizeRequestUrl(input);

    let bodyText = '';
    try {
        bodyText = await readFetchBodyText(input, init);
    } catch (err) {
        logError('Fetch Body Reader', err);
    }

    const decision = await resolveGhostDecision(url, bodyText);
    if (decision.blocked) {
        reportBlocked(decision, 'Fetch');
        return neverSettles();
    }

    const response = await originalFetch.apply(this, args);
    inspectFetchResponse(url, response);
    return response;
};

// ==========================================
// XMLHttpRequest
// ==========================================
const originalXhrOpen = XMLHttpRequest.prototype.open;
const originalXhrSend = XMLHttpRequest.prototype.send;

/** WeakMap instead of expando properties: nothing extra is visible on the XHR object. */
/** @type {WeakMap<XMLHttpRequest, { url: string, isAsync: boolean }>} */
const xhrMetadata = new WeakMap();

XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    xhrMetadata.set(this, { url: normalizeRequestUrl(url), isAsync: rest.length === 0 || rest[0] !== false });
    return originalXhrOpen.apply(this, arguments);
};

/**
 * @param {XMLHttpRequest} xhr
 * @param {string} url
 * @param {unknown} body
 */
function sendXhr(xhr, url, body) {
    xhr.addEventListener('load', function () {
        if (this.responseType !== '' && this.responseType !== 'text') return;
        sniffResponseText(url, this.responseText || '');
    });
    return originalXhrSend.call(xhr, body);
}

/**
 * @param {XMLHttpRequest} xhr
 * @param {string} url
 * @param {unknown} body
 * @param {Promise<string>} bodyTextPromise
 */
function deferXhrSend(xhr, url, body, bodyTextPromise) {
    bodyTextPromise
        .catch((err) => {
            logError('XHR Body Reader', err);
            return '';
        })
        .then((text) => resolveGhostDecision(url, text))
        .then((decision) => {
            if (decision.blocked) {
                reportBlocked(decision, 'XHR');
                return;
            }
            // The page may have aborted the request while it was held.
            if (xhr.readyState !== XMLHttpRequest.OPENED) return;
            sendXhr(xhr, url, body);
        })
        .catch((err) => logError('XHR Deferred Send', err));
}

XMLHttpRequest.prototype.send = function (body) {
    const { url, isAsync } = xhrMetadata.get(this) || { url: '', isAsync: true };
    const syncText = readBodyTextSync(body);

    if (syncText === null) {
        // A small Blob body: only an async request can wait for it to be read.
        if (!isAsync) return sendXhr(this, url, body);
        deferXhrSend(this, url, body, readBodyTextAsync(body));
        return;
    }

    const classification = classifyRequest(url, syncText);
    if (!isGhostRelevant(classification)) return sendXhr(this, url, body);

    if (areSettingsReady()) {
        const decision = decideGhostBlock(classification, getGhostSettings());
        if (decision.blocked) {
            reportBlocked(decision, 'XHR');
            return;
        }
        return sendXhr(this, url, body);
    }

    if (!isAsync) {
        // A synchronous XHR cannot be postponed: fail closed rather than leak.
        mdLog('🛡️ Ghost Guard', 'Held a synchronous ghost-relevant XHR (settings not loaded yet)', '#f59e0b');
        return;
    }
    deferXhrSend(this, url, body, Promise.resolve(syncText));
};

// ==========================================
// navigator.sendBeacon (used when closing tabs or navigating quickly)
// ==========================================
const nativeSendBeacon = navigator.sendBeacon;

if (typeof nativeSendBeacon === 'function') {
    /** @type {(url: string | URL, data?: BodyInit | null) => boolean} */
    const originalSendBeacon = nativeSendBeacon.bind(navigator);

    /**
     * @param {string | URL} url
     * @param {BodyInit | null | undefined} data
     * @param {Promise<string>} bodyTextPromise
     */
    const deferBeacon = (url, data, bodyTextPromise) => {
        bodyTextPromise
            .catch((err) => {
                logError('Beacon Body Reader', err);
                return '';
            })
            .then((text) => resolveGhostDecision(normalizeRequestUrl(url), text))
            .then((decision) => {
                if (decision.blocked) {
                    reportBlocked(decision, 'Beacon');
                    return;
                }
                if (!originalSendBeacon(url, data)) logError('Beacon', new Error('Deferred beacon was rejected by the browser'));
            })
            .catch((err) => logError('Beacon Deferred Send', err));
    };

    navigator.sendBeacon = function (url, data) {
        const syncText = readBodyTextSync(data);

        if (syncText === null) {
            // Blob beacon: keep native unload semantics unless stealth could be affected.
            const settings = getGhostSettings();
            const stealthOff = areSettingsReady() && !settings.vanishMode && !settings.ghostSeen && !settings.ghostOnline;
            if (stealthOff) return originalSendBeacon(url, data);
            deferBeacon(url, data, readBodyTextAsync(data));
            return true;
        }

        const classification = classifyRequest(normalizeRequestUrl(url), syncText);
        if (!isGhostRelevant(classification)) return originalSendBeacon(url, data);

        if (areSettingsReady()) {
            const decision = decideGhostBlock(classification, getGhostSettings());
            if (decision.blocked) {
                reportBlocked(decision, 'Beacon');
                return true; // Fake success
            }
            return originalSendBeacon(url, data);
        }

        deferBeacon(url, data, Promise.resolve(syncText));
        return true;
    };
}

// ==========================================
// WebSocket (MQTT presence on edge-chat.instagram.com)
// Patching the prototype (instead of replacing the constructor) keeps
// WebSocket.OPEN/CLOSED constants and `instanceof` intact for Instagram's code.
// ==========================================
const originalWebSocketSend = WebSocket.prototype.send;

/** @param {string} reason */
function logDroppedPresenceFrame(reason) {
    mdLog('🟢 Ghost Online', `Intercepted WebSocket presence packet${reason}`, '#10b981');
}

WebSocket.prototype.send = function (data) {
    if (areSettingsReady() && !getGhostSettings().ghostOnline) {
        return originalWebSocketSend.call(this, data);
    }

    const payloadText = decodeWebSocketPayload(data);
    if (payloadText === null || !isWebSocketPresencePayload(payloadText)) {
        return originalWebSocketSend.call(this, data);
    }

    if (areSettingsReady()) {
        logDroppedPresenceFrame('');
        return; // Drop packet
    }

    const socket = this;
    settingsReady
        .then(() => {
            if (getGhostSettings().ghostOnline) {
                logDroppedPresenceFrame(' (held until settings loaded)');
                return;
            }
            if (socket.readyState === WebSocket.OPEN) originalWebSocketSend.call(socket, data);
        })
        .catch((err) => logError('WebSocket Deferred Send', err));
};

// ==========================================
// Initial scan of server-rendered data on page load
// ==========================================

/**
 * Decodes a JSON string literal body captured by regex.
 * @param {string} raw
 * @returns {string}
 */
function decodeJsonStringLiteral(raw) {
    try {
        return JSON.parse('"' + raw + '"');
    } catch (err) {
        if (!(err instanceof SyntaxError)) throw err;
        return raw.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    }
}

function scanServerRenderedData() {
    try {
        window.__md_applyGhostVisuals();
    } catch (err) {
        logError('Ghost Visuals', err);
    }

    // 1. Standard JSON scripts
    document.querySelectorAll('script[type="application/json"]').forEach((scriptEl) => {
        const text = scriptEl.innerHTML;
        try {
            processAndPostData(JSON.parse(text));
        } catch (err) {
            if (!(err instanceof SyntaxError)) logError('SSR JSON Scan', err);
        }
    });

    // 2. Aggressive SSR parsing for heavily obfuscated React pages:
    // stuff any video_versions url or dash_manifest into the dictionary as a fallback.
    try {
        const html = document.documentElement.innerHTML;

        const videoMatches = [...html.matchAll(/"video_versions":\[\{[^}]*"url":"([^"]+)"/g)];
        const dashMatches = [...html.matchAll(/"video_dash_manifest":"([^"]+)"/g)];

        for (let i = 0; i < Math.max(videoMatches.length, dashMatches.length); i++) {
            const fakeId = 'ssr_video_' + i;
            const url = videoMatches[i] ? decodeJsonStringLiteral(videoMatches[i][1]) : '';
            const dashManifest = dashMatches[i] ? decodeJsonStringLiteral(dashMatches[i][1]) : null;

            window.__md_storyMedia[fakeId] = {
                media_id: fakeId,
                shortcode: fakeId,
                is_video: true,
                url: url,
                dash_manifest: dashManifest,
                signatures: url ? [extractSignatureFromUrl(url)] : []
            };
        }

        window.postMessage({ type: 'MD_STORY_MEDIA_UPDATE', media: window.__md_storyMedia }, '/');
    } catch (err) {
        logError('SSR Aggressive Scan', err);
    }
}

setTimeout(scanServerRenderedData, 2000);
