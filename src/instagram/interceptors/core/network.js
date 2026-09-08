import { mdLog } from './logger.js';
import { showGhostToast, isPresenceRequest, isSeenRequest, extractSignatureFromUrl, processAndPostData } from './fiber_search.js';
const originalFetch = window.fetch;
window.fetch = async function (...args) {
    let url = args[0];
    let options = args[1];
    let body = options ? options.body : "";

    if (isPresenceRequest(url, body)) {
        mdLog("🟢 Presence Shield", "Blocked Fetch request to broadcast presence (status offline)", "#10b981");
        showGhostToast("🟢", "#064e3b");
        return new Promise(() => { });
    }

    let seenCheck = isSeenRequest(url, body);
    if (seenCheck.blocked) {
        window.__md_handleGhostBlock(seenCheck.type, seenCheck.username);

        // Return a Promise that never resolves.
        // This is the absolute safest way to block a GraphQL request in a strict React app.
        // It prevents the app's .then() handlers from ever running, eliminating missing-field crashes.
        return new Promise(() => { });
    }

    try {
        let response = await originalFetch.apply(this, args);
        let clone = response.clone();

        let urlStr = (typeof url === 'string' ? url : (url.url || "")).toLowerCase();
        
        // Sniff all fetch responses for HD PFPs
        clone.text().then(text => {
            window.__md_sniffPfps(text);
            if (urlStr.includes('graphql') || urlStr.includes('reels_media') || urlStr.includes('feed/reels') || urlStr.includes('/api/v1/') || urlStr.includes('?__a=1')) {
                try {
                    processAndPostData(JSON.parse(text));
                } catch(e) {}
            }
        }).catch(e => { });

        return response;
    } catch (e) {
        throw e;
    }
};

// ==========================================
// Intercept XMLHttpRequest
// ==========================================
const originalXhrOpen = XMLHttpRequest.prototype.open;
const originalXhrSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._url = url;
    return originalXhrOpen.call(this, method, url, ...rest);
};

XMLHttpRequest.prototype.send = function (body) {
    if (isPresenceRequest(this._url, body)) {
        mdLog("🟢 Presence Shield", "Blocked XHR request to broadcast presence (status offline)", "#10b981");
        showGhostToast("🟢", "#064e3b");
        return;
    }

    let seenCheck = isSeenRequest(this._url, body);
    if (seenCheck.blocked) {
        window.__md_handleGhostBlock(seenCheck.type, seenCheck.username);

        // Hang the XHR forever
        return;
    }

    this.addEventListener('load', function () {
        if (this.responseType !== '' && this.responseType !== 'text') return;
        let txt = "";
        try { txt = this.responseText || ""; } catch (err) { return; }
        if (!txt) return;

        let urlStr = (this._url || "").toLowerCase();
        try { window.__md_sniffPfps(txt); } catch (e) {}
        
        if (urlStr.includes('graphql') || urlStr.includes('reels_media') || urlStr.includes('feed/reels') || urlStr.includes('/api/v1/') || urlStr.includes('?__a=1')) {
            try {
                let data = JSON.parse(txt);
                processAndPostData(data);
            } catch (e) { }
        }
    });

    return originalXhrSend.call(this, body);
};

// Initial Scan for JSON scripts on page load
setTimeout(() => {
    try { window.__md_applyGhostVisuals(); } catch(e) {}

    // 1. Try standard JSON scripts
    document.querySelectorAll('script[type="application/json"]').forEach(s => {
        try { 
            let text = s.innerHTML;
            window.__md_sniffPfps(text);
            processAndPostData(JSON.parse(text)); 
        } catch (e) { }
    });

    // 2. Aggressive SSR parsing for heavily obfuscated React pages
    try {
        let html = document.documentElement.innerHTML;
        window.__md_sniffPfps(html);
        let items = [];

        // Find all JSON-like objects containing video_versions or dash_manifest
        let regex = /\{"id":"[^"]+","video_versions":\[.*?\}/g;
        let matches = html.match(regex);
        if (matches) {
            for (let m of matches) {
                try {
                    // Try to balance brackets and parse
                    let clean = m + "]}";
                    // This is risky, a safer way is to just extract the URL/manifest directly and build a fake apiMedia object
                } catch (e) { }
            }
        }

        // Super aggressive: Just find ANY video_versions url or dash_manifest and stuff it into the dict
        // Since we only need the URL/manifest for fallback, we can assign them fake IDs.
        let vMatches = [...html.matchAll(/"video_versions":\[\{[^\}]*"url":"([^"]+)"/g)];
        let dashMatches = [...html.matchAll(/"video_dash_manifest":"([^"]+)"/g)];

        for (let i = 0; i < Math.max(vMatches.length, dashMatches.length); i++) {
            let fakeId = "ssr_video_" + i;
            let pUrl = "";
            let pDash = null;
            if (vMatches[i]) {
                try { pUrl = JSON.parse('"' + vMatches[i][1] + '"'); }
                catch (e) { pUrl = vMatches[i][1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'); }
            }
            if (dashMatches[i]) {
                try { pDash = JSON.parse('"' + dashMatches[i][1] + '"'); }
                catch (e) { pDash = dashMatches[i][1].replace(/\\u0026/g, '&').replace(/\\\//g, '/'); }
            }

            window.__md_storyMedia[fakeId] = {
                media_id: fakeId,
                shortcode: fakeId,
                is_video: true,
                url: pUrl,
                dash_manifest: pDash,
                signatures: []
            };
            if (window.__md_storyMedia[fakeId].url) {
                window.__md_storyMedia[fakeId].signatures.push(extractSignatureFromUrl(window.__md_storyMedia[fakeId].url));
            }
        }

        window.postMessage({ type: 'MD_STORY_MEDIA_UPDATE', media: window.__md_storyMedia }, '*');
    } catch (e) {
        console.error("Vanish aggressive SSR parsing failed:", e);
    }
}, 2000);
