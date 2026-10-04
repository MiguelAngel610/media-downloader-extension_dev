// Inject the network interceptor
const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/google_photos/interceptors/google_photos_interceptor.js');
script.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(script);

// Store intercepted network timestamps globally
let recentNetworkTimestamps = [];
window.addEventListener('message', (event) => {
    if (event.source === window && event.data && event.data.type === 'MD_GP_NETWORK_TIMESTAMPS') {
        recentNetworkTimestamps = [...new Set([...recentNetworkTimestamps, ...event.data.timestamps])].slice(-200);
    }
});

let dateTimeline = [];

function getGooglePhotosDate() {
    const dateDivs = document.querySelectorAll('div.R9U8ab[jsname="pG3jE"]');
    let activeDateDiv = null;
    for (let div of dateDivs) {
        if (div.getBoundingClientRect().width > 0) {
            activeDateDiv = div;
            break;
        }
    }

    const timeDivs = document.querySelectorAll('div.oBMhZb[jsname="VsDGqb"] span[aria-label^="Tiempo empleado"], div.oBMhZb[jsname="VsDGqb"] span[aria-label^="Time taken"]');
    let activeTimeDiv = null;
    for (let div of timeDivs) {
        if (div.getBoundingClientRect().width > 0) {
            activeTimeDiv = div;
            break;
        }
    }
    
    let dateStr = "";
    let timeStr = "";

    if (activeDateDiv) dateStr = activeDateDiv.textContent;
    if (activeTimeDiv) timeStr = activeTimeDiv.textContent;

    if (dateStr || timeStr) {
        return { dateStr, timeStr };
    }
    return null;
}

setInterval(() => {
    const current = getGooglePhotosDate();
    if (current) {
        if (dateTimeline.length === 0 || 
            dateTimeline[dateTimeline.length - 1].dateStr !== current.dateStr || 
            dateTimeline[dateTimeline.length - 1].timeStr !== current.timeStr) {
            
            dateTimeline.push({
                dateStr: current.dateStr,
                timeStr: current.timeStr,
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
        
        if (dateTimeline.length === 0) {
            if (window.MDToastManager) window.MDToastManager.showError("⚠️ Timeline empty. Is the info panel open?");
            sendResponse({ success: false });
            return true;
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

        if (!bestMatch) {
            if (window.MDToastManager) window.MDToastManager.showError("⚠️ bestMatch not found in timeline.");
            sendResponse({ success: false });
            return true;
        }

        if (!window.MDDateParser) {
            if (window.MDToastManager) window.MDToastManager.showError("⚠️ MDDateParser is not defined in content script.");
            sendResponse({ success: false });
            return true;
        }

        let parsed = window.MDDateParser.parseLocalizedDate(bestMatch.dateStr, bestMatch.timeStr);
        if (parsed) {
            // MAGIC HEURISTIC: Find exact seconds!
            const baseTime = parsed.getTime();
            const maxTime = baseTime + 59999;
            let exactTimestamp = null;

            // 1. Check network payloads
            for (let ts of recentNetworkTimestamps) {
                if (ts >= baseTime && ts <= maxTime) {
                    exactTimestamp = ts;
                    break;
                }
            }

            // 2. Check static DOM scripts
            if (!exactTimestamp) {
                const scripts = document.querySelectorAll('script');
                for (let s of scripts) {
                    if (!s.textContent) continue;
                    const regex = /\b(1[0-9]{12})\b/g;
                    let m;
                    while ((m = regex.exec(s.textContent)) !== null) {
                        const ts = parseInt(m[1], 10);
                        if (ts >= baseTime && ts <= maxTime) {
                            exactTimestamp = ts;
                            break;
                        }
                    }
                    if (exactTimestamp) break;
                }
            }

            if (exactTimestamp) {
                parsed = new Date(exactTimestamp);
                sendResponse({ success: true, timestamp: parsed.getTime(), hasSeconds: true });
            } else {
                sendResponse({ success: true, timestamp: parsed.getTime(), hasSeconds: false });
            }

            return true;
        } else {
            if (window.MDToastManager) window.MDToastManager.showError(`⚠️ Parsing failed for: ${bestMatch.dateStr} / ${bestMatch.timeStr}`);
            sendResponse({ success: false });
            return true;
        }
    }

    if (request.action === "show_download_toast") {
        let msg = request.hasSeconds ? `✅ Descargado: ${request.filename}` : `✅ Descargado (Sin seg): ${request.filename}`;
        if (window.MDToastManager) window.MDToastManager.showSuccess(msg);
        sendResponse({ success: true });
        return true;
    }
});
