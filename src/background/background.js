/* Media Downloader - Service Worker entry point.
 * Only wiring lives here: every event listener is registered synchronously at top level
 * (required so Chrome can wake the worker for them); the work is delegated to modules. */

importScripts(
    '/src/shared/utils/filename_formatter.js',
    '/src/background/session_store.js',
    '/src/background/native_host.js',
    '/src/background/backup_coordinator.js',
    '/src/background/photo_date_namer.js'
);

const CDN_TIMESTAMP_TIMEOUT_MS = 3000;
const SUPPORTED_PLATFORMS = Object.freeze([
    { platform: 'instagram', hosts: ['instagram.com'] },
    { platform: 'facebook', hosts: ['facebook.com', 'fb.watch'] },
    { platform: 'twitter', hosts: ['x.com', 'twitter.com'] },
]);

const backupCoordinator = self.createBackupCoordinator(MDNativeHost.postHostLog);

/** Disables Chrome's download bubble/shelf so downloads don't interrupt browsing. */
function disableChromeDownloadUI() {
    if (chrome.downloads && typeof chrome.downloads.setUiOptions === 'function') {
        chrome.downloads.setUiOptions({ enabled: false })
            .catch((err) => console.warn('Could not disable download UI via setUiOptions:', err.message));
    } else if (chrome.downloads && typeof chrome.downloads.setShelfEnabled === 'function') {
        chrome.downloads.setShelfEnabled(false);
    }
}

/**
 * @param {string} url
 * @returns {string | null}
 */
function detectPlatform(url) {
    let hostname;
    try {
        hostname = new URL(url).hostname.toLowerCase();
    } catch (err) {
        return null;
    }
    const match = SUPPORTED_PLATFORMS.find(({ hosts }) => hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`)));
    return match ? match.platform : null;
}

/**
 * Last-Modified of a CDN file (upload date for profile pictures). Aborts right after the headers.
 * @param {unknown} url
 * @returns {Promise<{ timestamp: number }>}
 */
async function fetchCdnTimestamp(url) {
    const now = Math.floor(Date.now() / 1000);
    if (typeof url !== 'string' || !url.startsWith('https://')) return { timestamp: now };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CDN_TIMESTAMP_TIMEOUT_MS);
    try {
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        const lastModified = response.headers.get('Last-Modified');
        controller.abort(); // only the headers were needed: skip downloading the image body
        const date = lastModified ? new Date(lastModified) : null;
        return { timestamp: date && !isNaN(date.getTime()) ? Math.floor(date.getTime() / 1000) : now };
    } catch (err) {
        console.warn('[CDN] Could not read Last-Modified, using current time:', err.message);
        return { timestamp: now };
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * @param {{ url?: string, filename?: string }} request
 * @returns {Promise<{ success: boolean, downloadId?: number, error?: string }>}
 */
async function downloadInBrowser(request) {
    disableChromeDownloadUI();
    try {
        const downloadId = await chrome.downloads.download({
            url: request.url,
            filename: request.filename || 'download.jpeg',
            conflictAction: 'uniquify',
        });
        return { success: true, downloadId };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * @param {Record<string, any>} request
 * @returns {import('./native_host.js').HostRequest}
 */
function toHostRequest(request) {
    return {
        url: request.url,
        account: request.account,
        mediaType: request.mediaType,
        platform: request.platform || 'auto',
        direct_metadata: request.direct_metadata || null,
    };
}

/** Quick Download from the popup: the platform is detected from the pasted URL. */
async function downloadPastedUrl(request) {
    const url = typeof request.url === 'string' ? request.url.trim() : '';
    const platform = detectPlatform(url);
    if (!platform) {
        return { status: 'error', message: 'Unsupported link. Paste an Instagram, Facebook or X URL.' };
    }
    const { selectedAccount } = await chrome.storage.local.get('selectedAccount');
    return MDNativeHost.sendDownloadRequest(
        toHostRequest({ url, platform, mediaType: 'auto', account: selectedAccount || 'M' }), null);
}

/** @type {Record<string, (request: Record<string, any>, sender: chrome.runtime.MessageSender) => unknown>} */
const messageRoutes = {
    queue_download: (request, sender) => MDNativeHost.sendDownloadRequest(toHostRequest(request), sender.tab ? sender.tab.id : null),
    download_url: (request) => downloadPastedUrl(request),
    browser_download: (request) => downloadInBrowser(request),
    get_cdn_timestamp: (request) => fetchCdnTimestamp(request.url),
    backup_user_done: (request, sender) => backupCoordinator.onUserDone(sender.tab.id, request.username),
    backup_log: (request) => {
        MDNativeHost.postHostLog('info', String(request.message || ''));
        return { ok: true };
    },
    check_backup_status: (request, sender) => backupCoordinator.getStatusForTab(sender.tab ? sender.tab.id : undefined),
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const route = request && messageRoutes[request.action];
    if (!route) return false;
    Promise.resolve()
        .then(() => route(request, sender))
        .then(sendResponse, (err) => {
            console.error(`[Background] '${request.action}' failed:`, err);
            sendResponse({ status: 'error', message: err && err.message ? err.message : String(err) });
        });
    return true; // keep the channel open for the async response
});

MDNativeHost.onHostCommand((message) => {
    const task = message.action === 'start_backup' ? backupCoordinator.enqueue(message.users) : backupCoordinator.stop();
    task.catch((err) => console.error(`[Background] ${message.action} failed:`, err));
});

chrome.tabs.onRemoved.addListener((tabId) => {
    backupCoordinator.onTabRemoved(tabId).catch((err) => console.error('[Background] onTabRemoved failed:', err));
});

chrome.alarms.onAlarm.addListener((alarm) => {
    MDNativeHost.handleAlarm(alarm);
    backupCoordinator.handleAlarm(alarm);
});

chrome.downloads.onDeterminingFilename.addListener(MDPhotoDateNamer.handleDeterminingFilename);

disableChromeDownloadUI();
MDNativeHost.connectNativeHost();
