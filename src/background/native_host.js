/* Media Downloader - Native Host Client (service worker)
 * Owns the Native Messaging port to host/host.py:
 *  - every download request gets a request_id that the host echoes back, so the result is
 *    delivered ONLY to the tab that asked (it used to be broadcast to every open tab);
 *  - requests made while the host is starting are kept in a persisted outbox and flushed
 *    once the host announces {"action": "host_ready"};
 *  - reconnection is scheduled with chrome.alarms (never setTimeout, which dies with the worker);
 *  - when the host is not installed the caller gets an explicit error for a toast (graceful fallback).
 * The port itself is a live handle and cannot be persisted: it is re-created on demand. */

const NATIVE_HOST_NAME = 'com.media.downloader';
const NATIVE_RECONNECT_ALARM = 'md-native-host-reconnect';
const NATIVE_RECONNECT_DELAY_MS = 5000;
const NATIVE_HOST_MISSING_RETRY_MS = 60000;
const PENDING_REQUESTS_KEY = 'md_pending_host_requests';
const OUTBOX_KEY = 'md_native_outbox';
const HOST_STATUS_KEY = 'md_native_host_status';
const PENDING_REQUEST_TTL_MS = 30 * 60 * 1000;
const HOST_MISSING_MESSAGE = 'Python host is not installed or not registered. Run host/Instalar_Backend.bat and reload the extension.';

/**
 * @typedef {Object} HostRequest
 * @property {string} url
 * @property {string} [account]
 * @property {string} [mediaType]
 * @property {string} platform
 * @property {Record<string, unknown> | null} direct_metadata
 */
/** @typedef {{ tabId: number | null, createdAt: number }} PendingRequest */
/** @typedef {{ available: boolean, lastError: string | null, checkedAt: number }} HostStatus */

/** @type {chrome.runtime.Port | null} */
let nativePort = null;
/** True once the host process sent host_ready on the current port. */
let hostReady = false;
/** @type {Array<(message: Record<string, unknown>) => void>} */
const hostCommandHandlers = [];

/**
 * @param {string | undefined | null} errorMessage
 * @returns {boolean} true for install/registration problems (as opposed to a crash or normal exit)
 */
function isHostMissingError(errorMessage) {
    return /not found|forbidden/i.test(errorMessage || '');
}

/** @param {HostStatus} status */
function saveHostStatus(status) {
    return chrome.storage.session.set({ [HOST_STATUS_KEY]: status })
        .catch((err) => console.error('[NativeHost] Could not persist host status:', err));
}

/** @param {number} delayMs */
function scheduleReconnect(delayMs) {
    chrome.alarms.create(NATIVE_RECONNECT_ALARM, { when: Date.now() + delayMs })
        .catch((err) => console.error('[NativeHost] Could not schedule reconnect alarm:', err));
}

/**
 * @param {number | null} tabId
 * @param {string} requestId
 * @param {Record<string, unknown>} response
 */
function deliverToTab(tabId, requestId, response) {
    if (tabId === null || tabId === undefined) return; // popup / background-originated request
    chrome.tabs.sendMessage(tabId, { action: 'host_response', requestId, response })
        .catch((err) => console.warn(`[NativeHost] Tab ${tabId} closed before receiving result ${requestId}:`, err.message));
}

/**
 * Reports failure for requests the host will never answer.
 * @param {string} reason
 * @param {{ includeQueued: boolean }} options - includeQueued=false keeps outbox requests alive
 *   (they were never sent and will be delivered by the next host process)
 */
async function failPendingRequests(reason, { includeQueued }) {
    /** @type {Array<{ request_id: string }>} */
    let queued = [];
    if (includeQueued) {
        await MDSessionStore.updateSession(OUTBOX_KEY, [], (outbox) => {
            queued = outbox;
            return []; // never download them by surprise once the host gets installed later
        });
    } else {
        queued = await MDSessionStore.readSession(OUTBOX_KEY, []);
    }
    const keepIds = new Set(includeQueued ? [] : queued.map((m) => m.request_id));

    /** @type {Record<string, PendingRequest>} */
    let failed = {};
    await MDSessionStore.updateSession(PENDING_REQUESTS_KEY, {}, (pending) => {
        for (const [requestId, entry] of Object.entries(pending)) {
            if (keepIds.has(requestId)) continue;
            failed[requestId] = entry;
            delete pending[requestId];
        }
        return pending;
    });
    for (const [requestId, entry] of Object.entries(failed)) {
        deliverToTab(entry.tabId, requestId, { status: 'error', message: reason, request_id: requestId });
    }
}

/** @param {Record<string, unknown>} message */
async function routeHostResult(message) {
    const requestId = typeof message.request_id === 'string' ? message.request_id : null;
    if (!requestId) {
        console.warn('[NativeHost] Host result without request_id (not routed):', message);
        return;
    }
    /** @type {PendingRequest | null} */
    let entry = null;
    await MDSessionStore.updateSession(PENDING_REQUESTS_KEY, {}, (pending) => {
        entry = pending[requestId] || null;
        delete pending[requestId];
        return pending;
    });
    if (!entry) {
        console.warn(`[NativeHost] Result for unknown or expired request ${requestId}`);
        return;
    }
    deliverToTab(entry.tabId, requestId, message);
}

async function flushOutbox() {
    if (!nativePort || !hostReady) return;
    /** @type {Array<HostRequest & { request_id: string }>} */
    let queued = [];
    await MDSessionStore.updateSession(OUTBOX_KEY, [], (outbox) => {
        queued = outbox;
        return [];
    });
    for (const message of queued) nativePort.postMessage(message);
    if (queued.length) console.log(`[NativeHost] Flushed ${queued.length} queued request(s)`);
}

/** @param {Record<string, unknown>} message */
function handleHostMessage(message) {
    if (message.action === 'host_ready') {
        hostReady = true;
        saveHostStatus({ available: true, lastError: null, checkedAt: Date.now() });
        flushOutbox().catch((err) => console.error('[NativeHost] Outbox flush failed:', err));
        return;
    }
    if (message.action === 'start_backup' || message.action === 'stop_backup') {
        for (const handler of hostCommandHandlers) handler(message);
        return;
    }
    // Progress updates are intentionally dropped (yt-dlp spam); every other status is a final result.
    if (message.status && message.status !== 'progress') {
        routeHostResult(message).catch((err) => console.error('[NativeHost] Could not route host result:', err));
    }
}

function handleDisconnect() {
    const errorMessage = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Native host exited';
    nativePort = null;
    hostReady = false;

    if (isHostMissingError(errorMessage)) {
        console.error('[NativeHost] Host unavailable:', errorMessage);
        saveHostStatus({ available: false, lastError: errorMessage, checkedAt: Date.now() });
        failPendingRequests(HOST_MISSING_MESSAGE, { includeQueued: true })
            .catch((err) => console.error('[NativeHost] Could not fail pending requests:', err));
        scheduleReconnect(NATIVE_HOST_MISSING_RETRY_MS);
        return;
    }
    console.warn('[NativeHost] Disconnected:', errorMessage);
    // In-flight requests will never be answered by the dead process; queued (outbox) ones survive.
    failPendingRequests(`Python host stopped unexpectedly (${errorMessage}). Try the download again.`, { includeQueued: false })
        .catch((err) => console.error('[NativeHost] Could not fail pending requests:', err));
    scheduleReconnect(NATIVE_RECONNECT_DELAY_MS);
}

/** Opens the port if needed. Errors (host missing, crash) arrive asynchronously via onDisconnect. */
function connectNativeHost() {
    if (nativePort) return;
    try {
        nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    } catch (err) {
        console.error('[NativeHost] connectNative threw:', err);
        nativePort = null;
        scheduleReconnect(NATIVE_HOST_MISSING_RETRY_MS);
        return;
    }
    hostReady = false;
    nativePort.onMessage.addListener(handleHostMessage);
    nativePort.onDisconnect.addListener(handleDisconnect);
}

/** @returns {Promise<void>} */
async function prunePendingRequests() {
    const now = Date.now();
    await MDSessionStore.updateSession(PENDING_REQUESTS_KEY, {}, (pending) => {
        for (const [id, entry] of Object.entries(pending)) {
            if (now - entry.createdAt > PENDING_REQUEST_TTL_MS) delete pending[id];
        }
        return pending;
    });
}

/**
 * Sends a download request; the final result is delivered later to `tabId` as host_response.
 * @param {HostRequest} request
 * @param {number | null} tabId
 * @returns {Promise<{ status: 'queued', requestId: string } | { status: 'error', message: string }>}
 */
async function sendDownloadRequest(request, tabId) {
    /** @type {HostStatus | null} */
    const status = await MDSessionStore.readSession(HOST_STATUS_KEY, null);
    connectNativeHost(); // also re-checks a host that was missing: the user may have installed it since
    if (status && !status.available) {
        return { status: 'error', message: HOST_MISSING_MESSAGE };
    }

    const requestId = crypto.randomUUID();
    await prunePendingRequests();
    await MDSessionStore.updateSession(PENDING_REQUESTS_KEY, {}, (pending) => {
        pending[requestId] = { tabId, createdAt: Date.now() };
        return pending;
    });

    const message = { ...request, request_id: requestId };
    if (nativePort && hostReady) {
        nativePort.postMessage(message);
    } else {
        await MDSessionStore.updateSession(OUTBOX_KEY, [], (outbox) => outbox.concat([message]));
    }
    return { status: 'queued', requestId };
}

/**
 * Fire-and-forget log line for the desktop app console (backup progress). Dropped when the host is down.
 * @param {'info' | 'success' | 'error'} level
 * @param {string} text
 */
function postHostLog(level, text) {
    if (nativePort && hostReady) {
        nativePort.postMessage({ action: 'backup_log', status: level, message: text });
    } else {
        console.info(`[NativeHost] (host offline, log not forwarded) ${text}`);
    }
}

/** @param {(message: Record<string, unknown>) => void} handler - receives start_backup / stop_backup */
function onHostCommand(handler) {
    hostCommandHandlers.push(handler);
}

/** @param {chrome.alarms.Alarm} alarm */
function handleAlarm(alarm) {
    if (alarm.name === NATIVE_RECONNECT_ALARM) connectNativeHost();
}

self.MDNativeHost = Object.freeze({ connectNativeHost, sendDownloadRequest, postHostLog, onHostCommand, handleAlarm });
