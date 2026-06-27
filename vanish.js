// vanish.js - Injected into the MAIN world to intercept network requests

window.__md_vanishMode = false;
window.__md_ghostOnline = false;
window.__md_ghostSeen = false;

window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data) return;

    if (event.data.type === 'MD_VANISH_TOGGLE') {
        window.__md_vanishMode = event.data.enabled;
        console.info("%c[Media Downloader] Vanish Mode is now " + (window.__md_vanishMode ? "ENABLED \ud83d\udc7b" : "DISABLED \ud83d\udc41\ufe0f"), "color: #a855f7; font-weight: bold; font-size: 14px;");
    }
    
    if (event.data.type === 'MD_GHOST_ONLINE_TOGGLE') {
        window.__md_ghostOnline = event.data.enabled;
        console.info("%c[Media Downloader] Ghost Mode (Online) is now " + (window.__md_ghostOnline ? "ENABLED \ud83d\udfe2" : "DISABLED \ud83d\udd34"), "color: #10b981; font-weight: bold; font-size: 14px;");
    }
    
    if (event.data.type === 'MD_GHOST_SEEN_TOGGLE') {
        window.__md_ghostSeen = event.data.enabled;
        console.info("%c[Media Downloader] Ghost Mode (Seen) is now " + (window.__md_ghostSeen ? "ENABLED \ud83d\udc40" : "DISABLED \ud83d\ude48"), "color: #10b981; font-weight: bold; font-size: 14px;");
    }

    if (event.data.type === 'MD_REQUEST_PFP_FIBER') {
        try {
            let id = event.data.id;
            let filename = event.data.filename;
            let idWithoutExt = filename ? filename.split('.')[0] : "";
            
            function getFiber(domEl) {
                if (!domEl) return null;
                for (let k of Object.keys(domEl)) {
                    if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) return domEl[k];
                }
                return null;
            }

            let foundUrls = new Set();
            let visited = new Set();

            function searchPfpProps(obj, depth) {
                if (depth > 12 || !obj) return;
                
                // Si es un string literal, comprobamos si contiene nuestra id única de imagen y es un link válido
                if (typeof obj === 'string') {
                    if (idWithoutExt && obj.includes(idWithoutExt) && obj.startsWith('http')) {
                        foundUrls.add(obj);
                    }
                    return;
                }
                
                if (typeof obj !== 'object') return;
                
                if (visited.has(obj)) return;
                visited.add(obj);

                for (let k of Object.keys(obj)) {
                    try {
                        searchPfpProps(obj[k], depth + 1);
                    } catch (e) { }
                }
            }

            // Escanear componentes raíz del DOM de la página para atrapar los verdaderos datos de estado (State) de IG
            document.querySelectorAll('main, header, section, [role="main"]').forEach(el => {
                let fiber = getFiber(el);
                let steps = 0;
                while (fiber && steps < 100) {
                    steps++;
                    searchPfpProps(fiber.memoizedProps, 0);
                    searchPfpProps(fiber.memoizedState, 0);
                    fiber = fiber.return;
                }
            });

            // Escanear variables globales de IG por si la data no está anidada en React
            if (window.__additionalData) searchPfpProps(window.__additionalData, 0);
            if (window._sharedData) searchPfpProps(window._sharedData, 0);

            let urlsArray = Array.from(foundUrls);
            
            // Decodificar si vinieron envueltas en JSON stringificado raro
            urlsArray = urlsArray.map(u => u.replace(/\\u0026/g, '&').replace(/\\\//g, '/'));

            // FILTRO INTELIGENTE: Ordenar por la resolución explícita en la URL (ej. p320x320, p640x640, p1080x1080, o stp=dst-jpg_s150x150)
            // Si no tiene resolución en la URL, asumimos que es la original máxima (le damos valor alto).
            urlsArray.sort((a, b) => {
                let getRes = (u) => {
                    let m = u.match(/(?:\/[sp]|_[sp])(\d+)x\d+/);
                    return m ? parseInt(m[1], 10) : 9999; // La original limpia no tiene resolución forzada
                };
                
                let resA = getRes(a);
                let resB = getRes(b);
                
                if (resA === resB) {
                    // Si empatan en resolución, preferimos la que NO tenga cifrado STP
                    let aStp = a.includes('stp=') ? 1 : 0;
                    let bStp = b.includes('stp=') ? 1 : 0;
                    return aStp - bStp;
                }

                return resB - resA; // Mayor resolución gana
            });
            
            let hdSrc = urlsArray.length > 0 ? urlsArray[0] : "";

            window.postMessage({ type: 'MD_PFP_RESULT', id: id, url: hdSrc }, '*');
        } catch(e) {
            window.postMessage({ type: 'MD_PFP_RESULT', id: event.data.id, url: "" }, '*');
        }
    }

    if (event.data.type === 'MD_REQUEST_FIBER') {
        try {
            let id = event.data.id;
            let el = document.querySelector('[data-md-id="' + id + '"]');

            let foundUrl = ""; let foundDash = ""; let foundId = ""; let foundCode = "";

            // === PHASE 1: Walk the React FIBER tree (not DOM tree) ===
            // This is the key innovation: the fiber tree follows React's component
            // hierarchy exactly, so we find the nearest ancestor component that
            // owns THIS specific reel's data, not a parent that owns ALL reels.

            function getFiber(domEl) {
                if (!domEl) return null;
                for (let k of Object.keys(domEl)) {
                    if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) return domEl[k];
                }
                return null;
            }

            // Search an object for media data, but NEVER enter Arrays.
            // Arrays are where Instagram stores the list of all reels — entering
            // them is what caused the wrong-reel bug.
            function searchProps(obj, depth, visited) {
                if (depth > 6 || !obj || typeof obj !== 'object') return;
                if (Array.isArray(obj)) return; // CRITICAL: never enter arrays
                if (visited.has(obj)) return;
                visited.add(obj);

                // Extract shortcode
                if (!foundCode && obj.code && typeof obj.code === 'string' && obj.code.length >= 10 && obj.code.length <= 15) {
                    foundCode = obj.code;
                }
                if (!foundCode && obj.shortcode && typeof obj.shortcode === 'string' && obj.shortcode.length >= 10 && obj.shortcode.length <= 15) {
                    foundCode = obj.shortcode;
                }

                // Extract numeric ID
                let objId = obj.pk || obj.media_id || obj.item_id;
                if (objId && (typeof objId === 'string' || typeof objId === 'number')) {
                    let strId = String(objId);
                    if (strId.match(/^\d+(_\d+)?$/)) {
                        if (!foundId) foundId = strId;
                    }
                }

                // Extract DASH manifest (validate it looks like real MPD XML)
                if (!foundDash && obj.video_dash_manifest && typeof obj.video_dash_manifest === 'string' && obj.video_dash_manifest.length > 50 && (obj.video_dash_manifest.includes('<MPD') || obj.video_dash_manifest.includes('<Period'))) {
                    foundDash = obj.video_dash_manifest;
                }
                if (!foundDash && obj.dash_manifest && typeof obj.dash_manifest === 'string' && obj.dash_manifest.length > 50 && (obj.dash_manifest.includes('<MPD') || obj.dash_manifest.includes('<Period'))) {
                    foundDash = obj.dash_manifest;
                }

                // Extract video URL
                if (!foundUrl && obj.video_versions && Array.isArray(obj.video_versions) && obj.video_versions.length > 0 && obj.video_versions[0].url) {
                    foundUrl = obj.video_versions[0].url;
                }
                if (!foundUrl && obj.video_url && typeof obj.video_url === 'string' && obj.video_url.startsWith('http')) {
                    foundUrl = obj.video_url;
                }

                if (foundDash) return; // Got what we need

                for (let k of Object.keys(obj)) {
                    try {
                        if (obj[k] && typeof obj[k] === 'object') {
                            searchProps(obj[k], depth + 1, visited);
                            if (foundDash) return;
                        }
                    } catch (e) { }
                }
            }

            // Walk up the fiber tree from the video element
            let fiber = getFiber(el);
            let fiberSteps = 0;
            let visited = new Set();

            while (fiber && fiberSteps < 200 && !foundDash) {
                fiberSteps++;

                // Search memoizedProps (the actual data passed to this component)
                if (fiber.memoizedProps && typeof fiber.memoizedProps === 'object') {
                    searchProps(fiber.memoizedProps, 0, visited);
                    if (foundDash) break;
                }

                // Search pendingProps as fallback
                if (fiber.pendingProps && typeof fiber.pendingProps === 'object' && fiber.pendingProps !== fiber.memoizedProps) {
                    searchProps(fiber.pendingProps, 0, visited);
                    if (foundDash) break;
                }

                fiber = fiber.return; // Walk up to parent fiber
            }

            // === PHASE 2: If fiber walk failed, try DOM walk but with strict shortcode guard ===
            if (!foundDash && !foundUrl) {
                let expectedShortcode = foundCode || event.data.shortcode;
                let domVisited = new Set();

                function searchObjStrict(obj, depth) {
                    if (depth > 4 || !obj || typeof obj !== 'object') return;
                    if (Array.isArray(obj)) return; // Still never enter arrays
                    if (domVisited.has(obj)) return;
                    domVisited.add(obj);

                    // If this object has a code and it doesn't match, skip entirely
                    if (expectedShortcode && obj.code && typeof obj.code === 'string') {
                        if (obj.code !== expectedShortcode) return;
                    }

                    if (!foundDash && obj.video_dash_manifest && typeof obj.video_dash_manifest === 'string') foundDash = obj.video_dash_manifest;
                    if (!foundDash && obj.dash_manifest && typeof obj.dash_manifest === 'string') foundDash = obj.dash_manifest;
                    if (!foundUrl && obj.video_versions && Array.isArray(obj.video_versions) && obj.video_versions.length > 0 && obj.video_versions[0].url) foundUrl = obj.video_versions[0].url;
                    if (!foundUrl && obj.video_url && typeof obj.video_url === 'string' && obj.video_url.startsWith('http')) foundUrl = obj.video_url;

                    let objId = obj.pk || obj.media_id || obj.item_id;
                    if (objId && (typeof objId === 'string' || typeof objId === 'number')) {
                        let strId = String(objId);
                        if (strId.match(/^\d+(_\d+)?$/) && !foundId) foundId = strId;
                    }
                    if (!foundCode && obj.code && typeof obj.code === 'string' && obj.code.length >= 10 && obj.code.length <= 15) foundCode = obj.code;

                    if (foundDash) return;
                    for (let k of Object.keys(obj)) { try { if (obj[k] && typeof obj[k] === 'object') { searchObjStrict(obj[k], depth + 1); if (foundDash) return; } } catch (e) { } }
                }

                let current = el;
                let maxDomDepth = 50;
                while (current && current !== document.body && maxDomDepth > 0 && !foundDash) {
                    for (let k of Object.keys(current)) {
                        if (k.startsWith('__reactProps$') && current[k]) {
                            searchObjStrict(current[k], 0);
                            if (foundDash) break;
                        }
                    }
                    current = current.parentElement;
                    maxDomDepth--;
                }
            }

            // === PHASE 3: If we have an ID but no manifest, search global initial data ===
            if (!foundDash && !foundUrl && foundId) {
                let initialVisited = new Set();
                let foundObj = null;
                function searchInitial(obj, depth) {
                    if (depth > 10 || !obj || typeof obj !== 'object' || foundObj) return;
                    if (initialVisited.has(obj)) return;
                    initialVisited.add(obj);

                    if (String(obj.id) === foundId || String(obj.pk) === foundId || String(obj.media_id) === foundId) {
                        if (obj.video_versions || obj.video_dash_manifest || obj.dash_manifest) {
                            foundObj = obj;
                            return;
                        }
                    }

                    let keys = Object.keys(obj);
                    for (let k of keys) { try { if (obj[k] && typeof obj[k] === 'object') searchInitial(obj[k], depth + 1); } catch (e) { } }
                }

                if (window.__initialData) searchInitial(window.__initialData, 0);
                if (!foundObj && window._sharedData) searchInitial(window._sharedData, 0);

                if (foundObj) {
                    if (foundObj.video_dash_manifest) foundDash = foundObj.video_dash_manifest;
                    else if (foundObj.dash_manifest) foundDash = foundObj.dash_manifest;
                    if (foundObj.video_versions && Array.isArray(foundObj.video_versions) && foundObj.video_versions.length > 0) {
                        foundUrl = foundObj.video_versions[0].url;
                    } else if (foundObj.video_url) {
                        foundUrl = foundObj.video_url;
                    }
                    if (!foundCode && foundObj.code && typeof foundObj.code === 'string' && foundObj.code.length <= 15) foundCode = foundObj.code;
                }
            }

            if (foundUrl || foundDash) {
                window.postMessage({ type: 'MD_FIBER_RESULT', id: id, url: foundUrl, dash: foundDash, media_id: foundId, shortcode: foundCode }, '*');
            } else {
                window.postMessage({ type: 'MD_FIBER_RESULT', id: id, error: true, media_id: foundId, shortcode: foundCode }, '*');
            }
        } catch (e) { }
    }
});

function showGhostToast(icon, color) {
    let btn = document.getElementById('md-floating-btn');
    if (btn) {
        let oldHtml = btn.innerHTML;
        let oldBg = btn.style.background;
        btn.innerHTML = `<span style="font-size:16px;">${icon}</span>`;
        btn.style.background = color;
        setTimeout(() => {
            btn.innerHTML = oldHtml;
            btn.style.background = oldBg;
        }, 1500);
    }
}

function isPresenceRequest(url, body) {
    if (!window.__md_ghostOnline) return false;
    let urlStr = (url || "").toString().toLowerCase();
    let bodyStr = (body || "").toString().toLowerCase();

    if (urlStr.includes('/ajax/presence/reconnect.php') || 
        urlStr.includes('/api/v1/presence/') ||
        (urlStr.includes('graphql') && bodyStr.includes('update_presence'))) {
        return true;
    }
    return false;
}

function isSeenRequest(url, body) {
    let urlStr = (url || "").toString().toLowerCase();
    let bodyStr = (body || "").toString().toLowerCase();

    let isStorySeen = bodyStr.includes('usepolarisstoriesv3seenmutation') ||
                      bodyStr.includes('storiesseenmutation') ||
                      bodyStr.includes('ig_reels_video_view') ||
                      bodyStr.includes('usepolarisstoriesv3seen') ||
                      urlStr.includes('stories/reels/seen') ||
                      urlStr.includes('v2/reels/seen') ||
                      urlStr.includes('/api/v1/media/seen');

    let isDMSeen = bodyStr.includes('usepolarisdirectthreadmarkreadmutation') ||
                   bodyStr.includes('directthreadmarkreadmutation') ||
                   urlStr.includes('threads/broadcast/mark_seen') ||
                   (urlStr.includes('direct_v2/threads') && urlStr.includes('/seen'));

    if (window.__md_vanishMode && isStorySeen) return { blocked: true, type: 'story' };
    if (window.__md_ghostSeen && isDMSeen) return { blocked: true, type: 'dm' };
    if (window.__md_ghostSeen && isStorySeen) return { blocked: true, type: 'story' }; // Fallback

    return { blocked: false };
}

// Intercept navigator.sendBeacon (used sometimes when closing tabs/navigating quickly)
const originalSendBeacon = navigator.sendBeacon;
if (originalSendBeacon) {
    navigator.sendBeacon = function (url, data) {
        let bodyStr = "";
        try {
            if (typeof data === 'string') bodyStr = data;
            else if (data instanceof Blob) bodyStr = "blob"; // Difficult to read sync, but IG usually sends JSON strings or FormData
            else if (data instanceof FormData) bodyStr = "formdata";
        } catch (e) { }

        if (isPresenceRequest(url, bodyStr)) {
            console.warn("%c[🟢 Ghost Mode] Blocked sendBeacon request to broadcast presence.", "color: #10b981; font-weight: bold;");
            showGhostToast("🟢", "#064e3b");
            return true;
        }

        let seenCheck = isSeenRequest(url, bodyStr);
        if (seenCheck.blocked) {
            console.warn(`%c[👀 Ghost Mode] Blocked sendBeacon request to mark ${seenCheck.type} as seen.`, "color: #f59e0b; font-weight: bold;");
            showGhostToast(seenCheck.type === 'story' ? "👻" : "👀", "#0f172a");
            return true; // Fake success
        }
        return originalSendBeacon.apply(this, arguments);
    };
}

// ==========================================
// Intercept Fetch
// ==========================================
window.__md_storyMedia = {};

function extractSignatureFromUrl(url) {
    if (!url) return null;
    try {
        let parts = new URL(url).pathname.split('/');
        return parts[parts.length - 1];
    } catch (e) {
        let match = url.match(/\/([^\/]+\.(jpg|webp|mp4))/);
        return match ? match[1] : null;
    }
}

function findStoryMedia(obj) {
    if (!obj || typeof obj !== 'object') return;

    if ((obj.video_versions || obj.image_versions2) && (obj.id || obj.pk)) {
        let id = obj.id || obj.pk;
        if (typeof id === 'string' && id.includes('_')) id = id.split('_')[0];

        let signatures = [];

        let mediaObj = {
            url: "",
            username: (obj.user && obj.user.username) || (obj.owner && obj.owner.username) || (obj.author && obj.author.username) || "",
            timestamp: obj.taken_at || obj.device_timestamp || Math.floor(Date.now() / 1000),
            shortcode: obj.code || obj.shortcode || id,
            media_id: id,
            dash_manifest: obj.video_dash_manifest || null,
            signatures: signatures
        };

        if (obj.video_versions && obj.video_versions.length > 0) {
            let bestVideo = obj.video_versions[0];
            let maxScore = [bestVideo.width || 0, bestVideo.height || 0, bestVideo.type || 0];

            for (let v of obj.video_versions) {
                if (v.url) signatures.push(extractSignatureFromUrl(v.url));

                let score = [v.width || 0, v.height || 0, v.type || 0];
                if (score[0] > maxScore[0] ||
                    (score[0] === maxScore[0] && score[1] > maxScore[1]) ||
                    (score[0] === maxScore[0] && score[1] === maxScore[1] && score[2] > maxScore[2])) {
                    maxScore = score;
                    bestVideo = v;
                }
            }
            mediaObj.url = bestVideo.url;
        } else if (obj.image_versions2 && obj.image_versions2.candidates && obj.image_versions2.candidates.length > 0) {
            let bestImg = obj.image_versions2.candidates[0];
            let maxScore = [bestImg.width || 0, bestImg.height || 0];

            for (let c of obj.image_versions2.candidates) {
                if (c.url) signatures.push(extractSignatureFromUrl(c.url));

                let score = [c.width || 0, c.height || 0];
                if (score[0] > maxScore[0] || (score[0] === maxScore[0] && score[1] > maxScore[1])) {
                    maxScore = score;
                    bestImg = c;
                }
            }
            mediaObj.url = bestImg.url;
        }

        if (mediaObj.url) {
            window.__md_storyMedia[id] = mediaObj;
        }
    }

    for (let k in obj) {
        if (obj[k] && typeof obj[k] === 'object') {
            findStoryMedia(obj[k]);
        }
    }
}

function processAndPostData(data) {
    if (!data) return;
    findStoryMedia(data);
    window.postMessage({ type: 'MD_STORY_MEDIA_UPDATE', media: window.__md_storyMedia }, '*');
}

const originalFetch = window.fetch;
window.fetch = async function (...args) {
    let url = args[0];
    let options = args[1];
    let body = options ? options.body : "";

    if (isPresenceRequest(url, body)) {
        console.warn("%c[🟢 Ghost Mode] Blocked fetch request to broadcast presence.", "color: #10b981; font-weight: bold;");
        showGhostToast("🟢", "#064e3b");
        return new Promise(() => { });
    }

    let seenCheck = isSeenRequest(url, body);
    if (seenCheck.blocked) {
        console.warn(`%c[👀 Ghost Mode] Blocked fetch request to mark ${seenCheck.type} as seen.`, "color: #f59e0b; font-weight: bold;");
        showGhostToast(seenCheck.type === 'story' ? "👻" : "👀", "#0f172a");

        // Return a Promise that never resolves.
        // This is the absolute safest way to block a GraphQL request in a strict React app.
        // It prevents the app's .then() handlers from ever running, eliminating missing-field crashes.
        return new Promise(() => { });
    }

    try {
        let response = await originalFetch.apply(this, args);
        let clone = response.clone();

        let urlStr = (typeof url === 'string' ? url : (url.url || "")).toLowerCase();
        if (urlStr.includes('graphql') || urlStr.includes('reels_media') || urlStr.includes('feed/reels') || urlStr.includes('/api/v1/') || urlStr.includes('?__a=1')) {
            clone.json().then(processAndPostData).catch(e => { });
        }

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
        console.warn("%c[🟢 Ghost Mode] Blocked XHR request to broadcast presence.", "color: #10b981; font-weight: bold;");
        showGhostToast("🟢", "#064e3b");
        return;
    }

    let seenCheck = isSeenRequest(this._url, body);
    if (seenCheck.blocked) {
        console.warn(`%c[👀 Ghost Mode] Blocked XHR request to mark ${seenCheck.type} as seen.`, "color: #f59e0b; font-weight: bold;");
        showGhostToast(seenCheck.type === 'story' ? "👻" : "👀", "#0f172a");

        // Hang the XHR forever
        return;
    }

    this.addEventListener('load', function () {
        let urlStr = (this._url || "").toLowerCase();
        if (urlStr.includes('graphql') || urlStr.includes('reels_media') || urlStr.includes('feed/reels') || urlStr.includes('/api/v1/') || urlStr.includes('?__a=1')) {
            try {
                let data = JSON.parse(this.responseText);
                processAndPostData(data);
            } catch (e) { }
        }
    });

    return originalXhrSend.call(this, body);
};

// Initial Scan for JSON scripts on page load
setTimeout(() => {
    // 1. Try standard JSON scripts
    document.querySelectorAll('script[type="application/json"]').forEach(s => {
        try { processAndPostData(JSON.parse(s.innerHTML)); } catch (e) { }
    });

    // 2. Aggressive SSR parsing for heavily obfuscated React pages
    try {
        let html = document.documentElement.innerHTML;
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
