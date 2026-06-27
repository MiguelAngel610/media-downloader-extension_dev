// src/telegram/main.js
(function() {
    console.log("[Media Downloader] Initializing Telegram Downloader...");

    const REFRESH_DELAY = 500;

    setInterval(() => {
        // Detect current telegram flavor
        if (location.host === "webz.telegram.org" || location.host === "web.telegram.org") {
            // Some "web.telegram.org" default to Z or K depending on region/preference. 
            // We can detect which UI is active.
            // Z uses "StoryViewer" and "#MediaViewer"
            // K uses "stories-viewer" and ".media-viewer-whole"
            
            if (document.getElementById("StoryViewer") || document.querySelector("#MediaViewer")) {
                if (window.__md_tel_initWebZ) window.__md_tel_initWebZ();
            }
        }
        
        if (location.host === "webk.telegram.org" || location.host === "web.telegram.org") {
            if (document.getElementById("stories-viewer") || document.querySelector(".media-viewer-whole") || document.querySelector(".pinned-audio") || document.querySelector("audio-element")) {
                if (window.__md_tel_initWebK) window.__md_tel_initWebK();
            }
        }
    }, REFRESH_DELAY);

    console.log("[Media Downloader] Telegram Downloader running.");
})();
