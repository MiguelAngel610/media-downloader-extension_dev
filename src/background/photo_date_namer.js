/* Media Downloader - Photo Date Namer (service worker)
 * Prefixes Google Photos / iCloud downloads with the photo's real capture date.
 * The date is asked to the content scripts of the open tabs (get_photo_date_at_time);
 * if none answers, the download start time is used. */

/**
 * @param {chrome.downloads.DownloadItem} item
 * @returns {boolean}
 */
function isPhotoServiceDownload(item) {
    const url = (item.url || '').toLowerCase();
    const referrer = (item.referrer || '').toLowerCase();
    const isGooglePhotos = url.includes('googleusercontent.com') || url.includes('photos.google.com') || referrer.includes('photos.google.com');
    const isICloud = url.includes('icloud-content.com') || url.includes('icloud.com') || referrer.includes('icloud.com');
    return isGooglePhotos || isICloud;
}

/**
 * @param {chrome.downloads.DownloadItem} item
 * @param {(suggestion?: chrome.downloads.FilenameSuggestion) => void} suggest
 * @returns {boolean | undefined} true when suggest() will be called asynchronously
 */
function handleDeterminingFilename(item, suggest) {
    if (!isPhotoServiceDownload(item)) return undefined;

    const extMatch = item.filename.match(/\.([^.]+)$/);
    const ext = extMatch ? `.${extMatch[1]}` : '';
    const baseName = item.filename.replace(/\.[^.]+$/, '');
    const hasDateAlready = /^\d{8}_\d{6}/.test(baseName);

    /** @param {number | null} tabIdForToast */
    const suggestFromStartTime = (tabIdForToast) => {
        if (hasDateAlready) {
            suggest();
            return;
        }
        const finalName = `${self.MDFilenameFormatter.formatDateTime(new Date(item.startTime))}_${baseName}${ext}`;
        suggest({ filename: finalName, conflictAction: 'uniquify' });
        if (tabIdForToast !== null) {
            chrome.tabs.sendMessage(tabIdForToast, { action: 'show_download_toast', filename: finalName, hasSeconds: true })
                .catch((err) => console.warn('[PhotoDateNamer] Could not show toast:', err.message));
        }
    };

    chrome.tabs.query({}, (tabs) => {
        if (tabs.length === 0) {
            suggestFromStartTime(null);
            return;
        }
        const targetTime = new Date(item.startTime).getTime();
        let responded = false;
        let pendingRequests = tabs.length;

        for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, { action: 'get_photo_date_at_time', time: targetTime }, (response) => {
                pendingRequests--;
                // Expected for every tab without our photo content script: reading lastError marks it handled.
                const unreachable = Boolean(chrome.runtime.lastError);
                if (!unreachable && !responded && response && response.success && response.timestamp) {
                    responded = true;
                    const includeSeconds = response.hasSeconds !== false;
                    const datePrefix = self.MDFilenameFormatter.formatDateTime(new Date(response.timestamp), includeSeconds);
                    const finalName = `${datePrefix}_${baseName}${ext}`;
                    suggest({ filename: finalName, conflictAction: 'uniquify' });
                    chrome.tabs.sendMessage(tab.id, { action: 'show_download_toast', filename: finalName, hasSeconds: includeSeconds })
                        .catch((err) => console.warn('[PhotoDateNamer] Could not show toast:', err.message));
                }
                if (pendingRequests === 0 && !responded) suggestFromStartTime(tab.id);
            });
        }
    });
    return true;
}

self.MDPhotoDateNamer = Object.freeze({ handleDeterminingFilename });
