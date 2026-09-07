/* Media Downloader - IG Interceptor Init: Loads ig_interceptor.js and wires settings listeners */

// Inject IG Interceptor Script (for GraphQL interception, which can be async)
const interceptorScript = document.createElement('script');
interceptorScript.src = chrome.runtime.getURL('src/interceptors/ig_interceptor.js');
interceptorScript.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(interceptorScript);

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

chrome.storage.local.get(['vanishMode', 'ghostOnline', 'ghostSeen'], function(result) {
    setTimeout(() => {
        if (result.vanishMode !== undefined) window.postMessage({ type: 'MD_VANISH_TOGGLE', enabled: !!result.vanishMode }, '*');
        if (result.ghostOnline !== undefined) window.postMessage({ type: 'MD_GHOST_ONLINE_TOGGLE', enabled: !!result.ghostOnline }, '*');
        if (result.ghostSeen !== undefined) window.postMessage({ type: 'MD_GHOST_SEEN_TOGGLE', enabled: !!result.ghostSeen }, '*');
    }, 100);
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'MD_UPDATE_SETTINGS') {
        if (msg.ghostOnline !== undefined) window.postMessage({ type: 'MD_GHOST_ONLINE_TOGGLE', enabled: !!msg.ghostOnline }, '*');
        if (msg.ghostSeen !== undefined) window.postMessage({ type: 'MD_GHOST_SEEN_TOGGLE', enabled: !!msg.ghostSeen }, '*');
    }
    if (msg.action === 'host_response' && msg.response) {
        if (msg.response.status === 'error' && window.MDToastManager) {
            window.MDToastManager.showError("Host Error: " + (msg.response.message || "Unknown error"));
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
