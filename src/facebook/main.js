/* Media Downloader for Facebook - Main init */

console.log("Media Downloader for Facebook Loaded");

// Inject interceptor into main world to capture video URLs and GraphQL responses
const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/interceptors/fb_interceptor.js');
script.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(script);

// Listen for video/image results from interceptor
window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.action === "FB_STORY_RESULT") {
        const url = event.data.url;
        const type = event.data.type; // "video" or "image"
        
        // Ensure metadata exists and fallback properly
        let md = event.data.metadata || {};
        const username = md.username || "fb_user";
        const shortcode = md.shortcode || "story";
        const timestamp = md.timestamp || Math.floor(Date.now() / 1000);

        if (url) {
            if (window.MDToastManager) window.MDToastManager.showInfo("⏳ Descargando medio...");

            chrome.runtime.sendMessage({
                action: "queue_download",
                url: url, // Pass the raw MP4/JPG URL directly to Python
                mediaType: "direct_story",
                platform: "facebook",
                direct_metadata: {
                    username: username,
                    shortcode: shortcode,
                    is_video: type === "video",
                    is_direct: true,
                    timestamp: timestamp
                }
            }, (response) => {
                if (response && response.status === "queued") {
                    console.log("[FB-MD] Download queued in background:", shortcode);
                } else if (response && response.status === "error") {
                    console.error("[FB-MD] Queue error:", response);
                    if (window.MDToastManager) window.MDToastManager.showError("❌ Error al procesar descarga");
                }
            });
        } else {
            if (window.MDToastManager) {
                window.MDToastManager.showError("Content URL not found. Try playing it first.");
            } else {
                alert("Content URL not found. Try playing it first.");
            }
        }
    }
});

// Listen for actual results from Python host
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "host_response") {
        if (request.data && request.data.status === "success") {
            if (window.MDToastManager) window.MDToastManager.showInfo("✅ Descarga completada");
        } else if (request.data && request.data.status === "error") {
            if (window.MDToastManager) window.MDToastManager.showError("❌ Fallo en Python: " + (request.data.message || "Error desconocido"));
        } else if (request.data && request.data.status === "skipped") {
            if (window.MDToastManager) window.MDToastManager.showInfo("⏭️ Archivo ya existía");
        }
    }
});

// Run UI injectors with debounce
let injectTimeout = null;
function debouncedInject() {
    if (injectTimeout) return;
    injectTimeout = setTimeout(() => {
        if (window.injectGhostModeToggles) window.injectGhostModeToggles();
        if (typeof injectStoryButtons === 'function') injectStoryButtons();
        if (typeof injectTheaterButtons === 'function') injectTheaterButtons();
        injectTimeout = null;
    }, 500);
}

function initFB() {
    if (!document.body) {
        setTimeout(initFB, 100);
        return;
    }

    // Set up MDObserverManager to re-run on DOM changes
    if (window.MDObserverManager) {
        window.MDObserverManager.observeDOM(() => {
            debouncedInject();
        });
    } else {
        setInterval(() => {
            debouncedInject();
        }, 1000);
    }
    
    // Register Global Shortcut Manager
    if (window.ShortcutManager) {
        window.ShortcutManager.onShortcutPressed(() => {
            // Find the first visible download button on the screen and click it
            const buttons = Array.from(document.querySelectorAll('.md-fb-download'));
            const visibleBtn = buttons.find(b => {
                const rect = b.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && rect.top >= 0;
            });
            
            if (visibleBtn) {
                visibleBtn.click();
                if (window.MDToastManager) window.MDToastManager.showInfo("Keyboard shortcut triggered download");
            } else {
                if (window.MDToastManager) window.MDToastManager.showWarning("No downloadable media found on screen");
            }
        });
    }

    setTimeout(debouncedInject, 2000);
}

initFB();
