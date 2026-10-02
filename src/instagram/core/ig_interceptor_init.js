/* Media Downloader - IG Interceptor Init: Loads ig_interceptor.js and wires settings listeners */

// Inject IG Interceptor Scripts sequentially to maintain dependency order
const scriptsToInject = [
    'dist/ig_interceptor.bundle.js'
];

function injectNextScript(index) {
    if (index >= scriptsToInject.length) {
        // Once all scripts are injected, fetch settings and broadcast them
        // This prevents a race condition where settings are sent before ghost mode listeners are ready
        chrome.storage.local.get(['vanishMode', 'ghostOnline', 'ghostSeen'], function(result) {
            if (result.vanishMode !== undefined) window.postMessage({ type: 'MD_VANISH_TOGGLE', enabled: !!result.vanishMode }, '*');
            if (result.ghostOnline !== undefined) window.postMessage({ type: 'MD_GHOST_ONLINE_TOGGLE', enabled: !!result.ghostOnline }, '*');
            if (result.ghostSeen !== undefined) window.postMessage({ type: 'MD_GHOST_SEEN_TOGGLE', enabled: !!result.ghostSeen }, '*');
        });
        return;
    }
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(scriptsToInject[index]);
    script.onload = function() {
        this.remove();
        injectNextScript(index + 1);
    };
    (document.head || document.documentElement).appendChild(script);
}

injectNextScript(0);

chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local') {
        if (changes.vanishMode) {
            window.postMessage({ type: 'MD_VANISH_TOGGLE', enabled: changes.vanishMode.newValue }, '*');
        }
        if (changes.ghostOnline) {
            window.postMessage({ type: 'MD_GHOST_ONLINE_TOGGLE', enabled: changes.ghostOnline.newValue }, '*');
        }
        if (changes.ghostSeen) {
            window.postMessage({ type: 'MD_GHOST_SEEN_TOGGLE', enabled: changes.ghostSeen.newValue }, '*');
        }
    }
});

// Initial settings are now broadcasted at the end of injectNextScript() to avoid race conditions.

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'MD_UPDATE_SETTINGS') {
        if (msg.ghostOnline !== undefined) window.postMessage({ type: 'MD_GHOST_ONLINE_TOGGLE', enabled: !!msg.ghostOnline }, '*');
        if (msg.ghostSeen !== undefined) window.postMessage({ type: 'MD_GHOST_SEEN_TOGGLE', enabled: !!msg.ghostSeen }, '*');
    }
    if (msg.action === 'host_response' && msg.response) {
        if (msg.response.status === 'error' && window.MDToastManager) {
            window.MDToastManager.showError("Host Error: " + (msg.response.message || "Unknown error"));
        } else if (msg.response.status === 'success' && window.MDToastManager) {
            let text = "✅ Download completed!";
            if (msg.response.filename) text += "<br><strong style='font-size:1.1em; opacity:0.9;'>" + msg.response.filename + "</strong>";
            window.MDToastManager.showSuccess(text, 4000);
        } else if (msg.response.status === 'skipped' && window.MDToastManager) {
            let text = "⏭️ File already exists";
            if (msg.response.filename) text += "<br><strong style='font-size:1.1em; opacity:0.9;'>" + msg.response.filename + "</strong>";
            window.MDToastManager.showInfo(text, 3000);
        } else if (msg.response.status === 'progress' && window.MDToastManager) {
            if (!window.__md_last_progress_toast || Date.now() - window.__md_last_progress_toast > 5000) {
                window.MDToastManager.showInfo("⏳ Downloading... <strong style='font-size:1.1em'>" + (msg.response.percent || "") + "</strong>");
                window.__md_last_progress_toast = Date.now();
            }
        }
    }
});

window.addEventListener('message', function(event) {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'MD_STORY_MEDIA_UPDATE') {
        Object.assign(window.__md_storyMediaDict, event.data.media);
        console.log("Media Downloader: Updated internal dictionary. Total items:", Object.keys(window.__md_storyMediaDict).length);
    }
    if (event.data.type === 'MD_FIBER_RESULT') {
        window.__md_fiberResults = window.__md_fiberResults || {};
        window.__md_fiberResults[event.data.id] = { url: event.data.url, dash_manifest: event.data.dash, media_id: event.data.media_id, index: event.data.index, shortcode: event.data.shortcode, user: event.data.user, time: event.data.time };
    }
    if (event.data.type === 'MD_PFP_RESULT') {
        window.__md_pfpResults = window.__md_pfpResults || {};
        window.__md_pfpResults[event.data.username] = event.data.url;
    }
    if (event.data.type === 'MD_PFPS_DICT_UPDATE') {
        try {
            event.data.urls.forEach(url => window.__md_pfps_list.add(url));
        } catch(e) {}
    }
});
