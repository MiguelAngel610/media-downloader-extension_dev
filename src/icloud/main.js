let dateTimeline = [];

function getICloudDate() {
    const titleH2 = document.querySelector('.ToolbarTitle-titleText');
    if (titleH2) {
        return titleH2.textContent;
    }
    return null;
}

setInterval(() => {
    const currentStr = getICloudDate();
    if (currentStr) {
        if (dateTimeline.length === 0 || dateTimeline[dateTimeline.length - 1].dateStr !== currentStr) {
            dateTimeline.push({
                dateStr: currentStr,
                appearedAt: Date.now()
            });
            if (dateTimeline.length > 50) {
                dateTimeline.shift();
            }
        }
    }
}, 300);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "get_photo_date_at_time") {
        const targetTime = request.time;
        
        // If we are the top-level wrapper and haven't found any dates, 
        // ignore the message so the inner iframe can respond instead.
        if (window.self === window.top && dateTimeline.length === 0) {
            return false;
        }

        let bestMatch = null;
        for (let i = dateTimeline.length - 1; i >= 0; i--) {
            if (dateTimeline[i].appearedAt <= targetTime + 500) {
                bestMatch = dateTimeline[i];
                break;
            }
        }
        if (!bestMatch && dateTimeline.length > 0) {
            bestMatch = dateTimeline[0];
        }

        if (bestMatch && window.MDDateParser) {
            const parsed = window.MDDateParser.parseLocalizedDate(bestMatch.dateStr);
            if (parsed) {
                sendResponse({ success: true, timestamp: parsed.getTime(), hasSeconds: false });
                return true;
            }
        }
        
        if (window.MDToastManager) window.MDToastManager.showError("⚠️ Could not extract iCloud date.");
        sendResponse({ success: false });
        return true;
    }

    if (request.action === "show_download_toast") {
        if (window.self === window.top) return false;
        if (window.MDToastManager) window.MDToastManager.showSuccess(`✅ Descargado: ${request.filename}`);
        sendResponse({ success: true });
        return true;
    }
});

// Universal Shortcut Support
if (window.ShortcutManager) {
    window.ShortcutManager.onShortcutPressed(() => {
        const btn = document.querySelector('.DownloadButton');
        if (btn) {
            btn.click();
            return;
        }

        // If we are the top window, try to find the iframe and click it inside
        if (window.self === window.top) {
            const iframe = document.querySelector('iframe');
            if (iframe) {
                try {
                    let doc = iframe.contentDocument || iframe.contentWindow.document;
                    let innerBtn = doc.querySelector('.DownloadButton');
                    if (innerBtn) {
                        innerBtn.click();
                    }
                } catch (err) { window.MDErrorReporter.reportError('iCloud: inner download button', err); /* cross-origin frames throw SecurityError */ }
            }
        }
    });
}
