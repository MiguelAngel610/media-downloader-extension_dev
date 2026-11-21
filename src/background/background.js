importScripts('/src/shared/utils/filename_formatter.js');

const NATIVE_HOST = "com.media.downloader";

// Disable Chrome's intrusive download tray/bubble/shelf UI during downloads
function disableChromeDownloadUI() {
    try {
        if (chrome.downloads && typeof chrome.downloads.setUiOptions === "function") {
            chrome.downloads.setUiOptions({ enabled: false }, () => {
                if (chrome.runtime.lastError) {
                    console.warn("Could not disable download UI via setUiOptions:", chrome.runtime.lastError.message);
                } else {
                    console.log("Chrome download UI successfully silenced.");
                }
            });
        } else if (chrome.downloads && typeof chrome.downloads.setShelfEnabled === "function") {
            chrome.downloads.setShelfEnabled(false);
            console.log("Chrome download shelf silenced via legacy API.");
        }
    } catch (e) {
        console.warn("Error trying to silence Chrome download UI:", e);
    }
}

disableChromeDownloadUI();

let downloadQueue = [];
let isProcessing = false;
let nativePort = null;
let backupQueue = [];
let isBackingUp = false;
let currentBackupTabId = null;

function connectToNativeHost() {
    console.log("Connecting to Native Host...");
    nativePort = chrome.runtime.connectNative(NATIVE_HOST);

    nativePort.onMessage.addListener((message) => {
        console.log("Received from host via port:", message);
        if (message.action === "start_backup") {
            console.log("Starting backup for users:", message.users);
            backupQueue = backupQueue.concat(message.users);
            processBackupQueue();
        } else if (message.action === "stop_backup") {
            console.log("Stopping backup...");
            backupQueue = [];
            isBackingUp = false;
            if (currentBackupTabId) {
                try {
                    chrome.tabs.remove(currentBackupTabId);
                } catch (e) { }
                currentBackupTabId = null;
            }
            if (nativePort) {
                nativePort.postMessage({ action: "backup_log", status: "error", message: `\n[Backup] 🛑 Stopped manually by user.` });
            }
        } else if (message.status) {
            // Drop progress updates completely as requested by the user to avoid yt-dlp bugs and IPC spam
            if (message.status === 'progress') {
                return;
            }

            // General response from host (e.g. success or error for a download)
            chrome.tabs.query({}, (tabs) => {
                for (let tab of tabs) {
                    chrome.tabs.sendMessage(tab.id, { action: "host_response", response: message }).catch(() => {});
                }
            });
        }
    });

    nativePort.onDisconnect.addListener(() => {
        console.error("Native host disconnected", chrome.runtime.lastError);
        nativePort = null;
        setTimeout(connectToNativeHost, 5000);
    });
}

connectToNativeHost();

let currentBackupCuenta = "M";
let currentBackupUsername = null;

function processBackupQueue() {
    if (isBackingUp || backupQueue.length === 0) return;

    isBackingUp = true;
    let target = backupQueue.shift();
    let username = typeof target === 'object' ? target.username : target;
    currentBackupCuenta = typeof target === 'object' ? (target.cuenta || "M") : "M";
    currentBackupUsername = username;

    console.log(`Processing backup for: ${username} (Account: ${currentBackupCuenta})`);

    // Tell TCP clients we started
    if (nativePort) {
        nativePort.postMessage({ action: "backup_log", status: "info", message: `\n[Backup] Starting backup for @${username}...` });
    }

    chrome.tabs.create({ url: `https://www.instagram.com/${username}/`, active: false }, (tab) => {
        currentBackupTabId = tab.id;
        // Content script auto_backup.js will take over in this tab.
        // It will signal back when done via "backup_user_done"
    });
}

chrome.tabs.onRemoved.addListener((tabId) => {
    if (isBackingUp && tabId === currentBackupTabId) {
        console.log(`Backup tab ${tabId} was closed externally.`);
        currentBackupTabId = null;
        isBackingUp = false;

        if (nativePort) {
            nativePort.postMessage({ action: "backup_log", status: "error", message: `\n[Backup] ⚠️ Tab was closed externally. Moving to next user...` });
        }

        setTimeout(processBackupQueue, 1000);
    }
});

// Listen for messages from content.js or popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "queue_download") {
        downloadQueue.push(request);
        sendResponse({ status: "queued" });
        processQueue();
        return true;
    } else if (request.action === "browser_download") {
        disableChromeDownloadUI();
        chrome.downloads.download({
            url: request.url,
            filename: request.filename || "download.jpeg",
            conflictAction: "uniquify"
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId: downloadId });
            }
        });
        return true;
    } else if (request.action === "get_cdn_timestamp") {
        let hdUrl = request.url;
        if (!hdUrl) {
            sendResponse({ timestamp: Math.floor(Date.now() / 1000) });
            return true;
        }

        let controller = new AbortController();
        let timeoutId = setTimeout(() => controller.abort(), 3000); // 3 sec timeout

        fetch(hdUrl, { method: 'GET', signal: controller.signal })
            .then(res => {
                clearTimeout(timeoutId);
                let lastMod = res.headers.get('Last-Modified');

                // Abortar la descarga del cuerpo de la imagen inmediatamente (solo queriamos las cabeceras)
                controller.abort();

                let d = lastMod ? new Date(lastMod) : new Date();
                let unixTime = Math.floor(d.getTime() / 1000);
                sendResponse({ timestamp: unixTime });
            })
            .catch(err => {
                // Fetch aborted intentionally or network error
                clearTimeout(timeoutId);
                let unixTime = Math.floor(Date.now() / 1000);
                sendResponse({ timestamp: unixTime });
            });

        return true;
    }
});

function processQueue() {
    if (isProcessing || downloadQueue.length === 0) return;

    isProcessing = true;
    const request = downloadQueue.shift();

    sendToNativeHost(request, (response) => {
        isProcessing = false;
        processQueue();
    });
}

function sendToNativeHost(request, sendResponse) {
    console.log(`Sending to host: ${request.url} using account ${request.account} with mediaType ${request.mediaType}`);

    try {
        let message = {
            url: request.url,
            account: request.account,
            mediaType: request.mediaType,
            platform: request.platform || "auto",
            direct_metadata: request.direct_metadata || null
        };

        if (nativePort) {
            nativePort.postMessage(message);
            sendResponse({ status: "success", message: "Sent via persistent port" });
        } else {
            console.warn("Native port not connected, attempting to reconnect...");
            connectToNativeHost();
            // Retry sending in 1 second
            setTimeout(() => {
                if (nativePort) nativePort.postMessage(message);
            }, 1000);
            sendResponse({ status: "queued", message: "Waiting for port reconnect" });
        }
    } catch (e) {
        console.error("Failed to connect to native host:", e);
        sendResponse({ status: "error", message: e.toString() });
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Other existing listeners handled above
    if (request.action === "backup_user_done") {
        console.log(`Finished backup for tab ${sender.tab.id}. Closing tab.`);
        if (nativePort) {
            nativePort.postMessage({ action: "backup_log", status: "success", message: `[Backup] Finished processing @${request.username}.` });
        }
        chrome.tabs.remove(sender.tab.id);
        isBackingUp = false;
        setTimeout(processBackupQueue, 2000); // 2 second delay between users to avoid ratelimits
        return true;
    }

    if (request.action === "backup_log") {
        if (nativePort) {
            nativePort.postMessage({ action: "backup_log", status: "info", message: request.message });
        }
        return true;
    }

    if (request.action === "check_backup_status") {
        if (isBackingUp && sender.tab && sender.tab.id === currentBackupTabId) {
            // Find username from URL
            let usernameMatch = sender.tab.url.match(/instagram\.com\/([^\/?#]+)/);
            let username = usernameMatch ? usernameMatch[1] : "unknown";
            sendResponse({ isBackingUp: true, username: currentBackupUsername || username, cuenta: currentBackupCuenta });
        } else {
            sendResponse({ isBackingUp: false });
        }
        return true;
    }
});

// Intercept downloads from Google Photos and iCloud to format their filenames
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    const url = (item.url || "").toLowerCase();
    const referrer = (item.referrer || "").toLowerCase();
    
    const isGooglePhotos = url.includes('googleusercontent.com') || url.includes('photos.google.com') || referrer.includes('photos.google.com');
    const isICloud = url.includes('icloud-content.com') || url.includes('icloud.com') || referrer.includes('icloud.com');

    if (isGooglePhotos || isICloud) {
        const extMatch = item.filename.match(/\.([^.]+)$/);
        const ext = extMatch ? `.${extMatch[1]}` : "";
        const baseName = item.filename.replace(/\.[^.]+$/, "");
        const hasDateAlready = /^\d{8}_\d{6}/.test(baseName);
         chrome.tabs.query({}, (tabs) => {
            const targetTime = new Date(item.startTime).getTime();
            let responded = false;
            let pendingRequests = tabs.length;
            
            if (tabs.length === 0) {
                if (!hasDateAlready) {
                    const datePrefix = self.MDFilenameFormatter.formatDateTime(new Date(item.startTime));
                    suggest({ filename: `${datePrefix}_${baseName}${ext}`, conflictAction: "uniquify" });
                } else {
                    suggest();
                }
                return;
            }

            for (let tab of tabs) {
                chrome.tabs.sendMessage(tab.id, { action: "get_photo_date_at_time", time: targetTime }, (response) => {
                    pendingRequests--;
                    if (chrome.runtime.lastError) {
                        // ignore error for tabs without our script
                    } else if (!responded && response && response.success && response.timestamp) {
                        responded = true;
                        const includeSeconds = response.hasSeconds !== false;
                        const datePrefix = self.MDFilenameFormatter.formatDateTime(new Date(response.timestamp), includeSeconds);
                        const finalName = `${datePrefix}_${baseName}${ext}`;
                        suggest({ filename: finalName, conflictAction: "uniquify" });
                        chrome.tabs.sendMessage(tab.id, { action: "show_download_toast", filename: finalName, hasSeconds: includeSeconds });
                    }
                    
                    if (pendingRequests === 0 && !responded) {
                        if (!hasDateAlready) {
                            const datePrefix = self.MDFilenameFormatter.formatDateTime(new Date(item.startTime));
                            const finalName = `${datePrefix}_${baseName}${ext}`;
                            suggest({ filename: finalName, conflictAction: "uniquify" });
                            chrome.tabs.sendMessage(tab.id, { action: "show_download_toast", filename: finalName, hasSeconds: true });
                        } else {
                            suggest();
                        }
                    }
                });
            }
        });
        
        return true; // Indicates suggest() is called asynchronously
    }
});
