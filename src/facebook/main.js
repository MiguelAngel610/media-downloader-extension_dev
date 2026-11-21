/* Media Downloader for Facebook - Main init */

console.log("Media Downloader for Facebook Loaded");

// Inject interceptor into main world to capture video URLs and GraphQL responses
const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/facebook/interceptors/fb_interceptor.js');
script.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(script);

// Listen for video/image results from interceptor
window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.action === "FB_STORY_RESULT") {
        const url = event.data.url;
        const type = event.data.type; // "video" or "image"
        
        let md = event.data.metadata || {};
        const username = md.username || "fb_user";
        const shortcode = md.shortcode || "story";
        const timestamp = md.timestamp || Math.floor(Date.now() / 1000);

        if (url || md.dash_manifest || md.story_url) {
            let finalUrl = url || md.story_url;
            let finalMediaType = (url || md.dash_manifest) ? "direct_story" : "auto";

            if (!url && !md.dash_manifest) {
                console.warn("[FB-MD] GraphQL Cache miss. Delegating story URL to yt-dlp fallback.");
            }

            if (window.MDToastManager) window.MDToastManager.showInfo("⏳ Downloading media...");

            chrome.runtime.sendMessage({
                action: "queue_download",
                url: finalUrl,
                mediaType: finalMediaType,
                platform: "facebook",
                direct_metadata: {
                    username: username,
                    shortcode: shortcode,
                    is_video: type === "video",
                    is_direct: !!url || !!md.dash_manifest,
                    timestamp: timestamp,
                    dash_manifest: md.dash_manifest,
                    story_url: md.story_url
                }
            }, (response) => {
                if (response && response.status === "queued") {
                    console.log("[FB-MD] Download queued in background:", shortcode);
                } else {
                    const reason = chrome.runtime.lastError ? chrome.runtime.lastError.message : (response && response.message) || "Unknown error";
                    console.error("[FB-MD] Queue error:", reason);
                    if (window.MDToastManager) window.MDToastManager.showError("❌ Download not started", 5000, reason);
                }
            });
        } else {
            console.warn("[FB-MD] No URL or story URL available to download.");
            if (window.MDToastManager) {
                window.MDToastManager.showError("❌ Could not extract URL and no fallback URL available.");
            }
        }
    }
});

// Listen for actual results from Python host
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "host_response" && request.response) {
        let msg = request.response;
        if (msg.status === "success") {
            if (window.MDToastManager) window.MDToastManager.showSuccess("✅ Download completed!");
        } else if (msg.status === "error") {
            let errorText = msg.message || "Unknown error";
            if (msg.log) errorText += " | Log: " + msg.log.substring(0, 50);
            if (window.MDToastManager) window.MDToastManager.showError("❌ Python Host Error: " + errorText);
            console.error("[FB-MD] Python Error:", msg);
        } else if (msg.status === "skipped") {
            if (window.MDToastManager) window.MDToastManager.showInfo("⏭️ File already exists");
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
