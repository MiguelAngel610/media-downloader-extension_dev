/* Media Downloader - Telegram Vanish Init: injects tel_vanish.js into the main world */

(function () {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/interceptors/tg_interceptor.js');
    script.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(script);

    const pending = new Map();

    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) return;

        if (event.data.type === 'MD_TEL_FETCH_VIDEO_RESULT') {
            const entry = pending.get(event.data.requestId);
            if (!entry) return;
            pending.delete(event.data.requestId);
            if (event.data.ok) {
                entry.resolve({ blob: event.data.blob, mimeType: event.data.mimeType });
            } else {
                entry.reject(new Error(event.data.error + (event.data.bodyPreview ? " | body: " + event.data.bodyPreview : "")));
            }
        }

        if (event.data.type === 'MD_TEL_FETCH_VIDEO_PROGRESS') {
            const entry = pending.get(event.data.requestId);
            if (entry && entry.onProgress) entry.onProgress(event.data.progress);
        }
    });

    // Public API used by downloader.js: returns a Promise<{blob, mimeType}>.
    window.__md_tel_fetch_video_mainworld = (url, onProgress) => {
        const requestId = 'mdtel_' + Math.random().toString(36).slice(2) + '_' + Date.now();
        return new Promise((resolve, reject) => {
            pending.set(requestId, { resolve, reject, onProgress });
            window.postMessage({ type: 'MD_TEL_FETCH_VIDEO', requestId, url }, '*');

            // Safety timeout so a request can never hang forever.
            setTimeout(() => {
                if (pending.has(requestId)) {
                    pending.delete(requestId);
                    reject(new Error('Timed out waiting for main-world fetch response'));
                }
            }, 60000);
        });
    };
})();
