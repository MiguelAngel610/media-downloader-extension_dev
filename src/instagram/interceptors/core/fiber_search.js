import { mdLog } from './logger.js';
window.addEventListener('message', function(event) {
if (event.data.type === 'MD_REQUEST_FIBER') {
        try {
            let id = event.data.id;
            let el = document.querySelector('[data-md-id="' + id + '"]');

            let foundUrl = ""; let foundDash = ""; let foundId = ""; let foundCode = ""; let foundUser = ""; let foundTime = null; let foundIndex = null;

            // === PHASE 1: Walk the React FIBER tree (not DOM tree) ===
            // This is the key innovation: the fiber tree follows React's component
            // hierarchy exactly, so we find the nearest ancestor component that
            // owns THIS specific reel's data, not a parent that owns ALL reels.
            
            let expectedShortcode = event.data.shortcode;
            let posterSig = event.data.posterSig;

            function getFiber(domEl) {
                if (!domEl) return null;
                for (let k of Object.keys(domEl)) {
                    if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) return domEl[k];
                }
                return null;
            }

            // Search an object for media data. Now safely enters arrays to find the true index.
            function searchProps(obj, depth, visited, inheritedCode = null, possibleIndex = -1) {
                if (depth > 15 || !obj || typeof obj !== 'object') return;
                
                // We now safely enter arrays because posterSig and expectedShortcode act as strict guards
                if (visited.has(obj)) return;
                visited.add(obj);

                let myCode = inheritedCode;
                if (obj.code && typeof obj.code === 'string' && obj.code.length >= 10 && obj.code.length <= 50) myCode = obj.code;
                else if (obj.shortcode && typeof obj.shortcode === 'string' && obj.shortcode.length >= 10 && obj.shortcode.length <= 50) myCode = obj.shortcode;

                // STRICT SHORTCODE GUARD: Prevents bleeding into adjacent/pinned posts
                if (expectedShortcode && myCode && myCode !== expectedShortcode) return;

                // (Mathematical Guard moved below to allow User/Time extraction first)

                // Extract shortcode
                if (!foundCode && myCode) {
                    foundCode = myCode;
                }

                // Extract numeric ID
                let objId = obj.pk || obj.media_id || obj.item_id;
                if (objId && (typeof objId === 'string' || typeof objId === 'number')) {
                    let strId = String(objId);
                    if (strId.match(/^\d+(_\d+)?$/)) {
                        if (!foundId) foundId = strId;
                    }
                }

                // Extract exact Username and Timestamp
                if (!foundUser && obj.user && obj.user.username) {
                    foundUser = obj.user.username;
                } else if (!foundUser && obj.owner && obj.owner.username) {
                    foundUser = obj.owner.username;
                } else if (!foundUser && obj.author && obj.author.username) {
                    foundUser = obj.author.username;
                } else if (!foundUser && obj.username && typeof obj.username === 'string' && !obj.username.includes(' ')) {
                    foundUser = obj.username;
                }
                
                if (!foundTime && obj.taken_at) {
                    foundTime = obj.taken_at;
                } else if (!foundTime && obj.taken_at_timestamp) {
                    foundTime = obj.taken_at_timestamp;
                } else if (!foundTime && obj.device_timestamp) {
                    foundTime = obj.device_timestamp;
                }

                // ABSOLUTE MATHEMATICAL GUARD (For Feed Carousels)
                let carouselArray = null;
                if (obj.carousel_media && Array.isArray(obj.carousel_media)) {
                    carouselArray = obj.carousel_media;
                } else if (obj.edge_sidecar_to_children && obj.edge_sidecar_to_children.edges && Array.isArray(obj.edge_sidecar_to_children.edges)) {
                    carouselArray = obj.edge_sidecar_to_children.edges.map(e => e.node);
                }

                if (event.data.carouselIndex && carouselArray) {
                    let targetIdx = event.data.carouselIndex - 1;
                    if (targetIdx >= 0 && targetIdx < carouselArray.length) {
                        posterSig = null; 
                        foundIndex = event.data.carouselIndex;
                        searchProps(carouselArray[targetIdx], depth + 1, visited, myCode);
                        return; 
                    }
                } else if (carouselArray) {
                    // This object is a carousel container. We already extracted its user/time/id.
                    // We MUST NOT extract media URLs from this root object, because we need to enter 
                    // the carousel_media array to capture the true array index for the filename (_1, _2, etc).
                    for (let i = 0; i < carouselArray.length; i++) {
                        try {
                            if (carouselArray[i] && typeof carouselArray[i] === 'object') {
                                searchProps(carouselArray[i], depth + 1, visited, myCode, i);
                                if (foundDash && foundUser && foundTime) return;
                            }
                        } catch (e) { }
                    }
                    // Continue recursing other properties to ensure we don't miss deeply nested user/time
                    for (let k of Object.keys(obj)) {
                        try {
                            if (k !== 'carousel_media' && k !== 'edge_sidecar_to_children') {
                                if (obj[k] && typeof obj[k] === 'object') {
                                    searchProps(obj[k], depth + 1, visited, myCode, -1);
                                    if (foundDash && foundUser && foundTime) return;
                                }
                            }
                        } catch (e) { }
                    }
                    return; // Skip media extraction for the container itself
                }

                // STRICT SLIDE GUARD (For Carousels):
                // If we are looking for a specific slide inside a carousel array (possibleIndex >= 0),
                // we MUST verify we are on the correct slide.
                if (possibleIndex >= 0 && (obj.image_versions2 || obj.video_versions || obj.display_url || obj.video_url || obj.video_dash_manifest)) {
                    let isMatch = false;

                    // 1. Try matching by unique ID (Flawless for Blob videos)
                    let objId = obj.pk || obj.media_id || obj.item_id || obj.id;
                    if (foundId && objId && String(objId) === foundId) {
                        isMatch = true;
                    }

                    // 2. Fallback to matching by posterSig
                    if (!isMatch && posterSig && !posterSig.startsWith('blob:')) {
                        if (obj.image_versions2 && obj.image_versions2.candidates && Array.isArray(obj.image_versions2.candidates)) {
                            isMatch = isMatch || obj.image_versions2.candidates.some(c => c.url && c.url.includes(posterSig));
                        }
                        if (obj.video_versions && Array.isArray(obj.video_versions)) {
                            isMatch = isMatch || obj.video_versions.some(v => v.url && v.url.includes(posterSig));
                        }
                        if (obj.display_url && typeof obj.display_url === 'string') {
                            isMatch = isMatch || obj.display_url.includes(posterSig);
                        }
                        if (obj.video_url && typeof obj.video_url === 'string') {
                            isMatch = isMatch || obj.video_url.includes(posterSig);
                        }
                    }

                    // 3. Fallback to matching by video manifest or URL
                    if (!isMatch) {
                        if (foundDash && (obj.video_dash_manifest === foundDash || obj.dash_manifest === foundDash)) {
                            isMatch = true;
                        } else if (foundUrl) {
                            if (obj.video_versions && Array.isArray(obj.video_versions) && obj.video_versions.some(v => v.url === foundUrl)) {
                                isMatch = true;
                            } else if (obj.video_url === foundUrl) {
                                isMatch = true;
                            }
                        }
                    }

                    if (!isMatch) return; // Wrong slide! Skip this entire object.
                }

                // Extract DASH manifest (validate it looks like real MPD XML)
                if ((!foundDash || (possibleIndex >= 0 && !foundIndex)) && obj.video_dash_manifest && typeof obj.video_dash_manifest === 'string' && obj.video_dash_manifest.length > 50 && (obj.video_dash_manifest.includes('<MPD') || obj.video_dash_manifest.includes('<Period'))) {
                    if (!foundDash) foundDash = obj.video_dash_manifest;
                    if (possibleIndex >= 0) foundIndex = possibleIndex + 1;
                }
                if ((!foundDash || (possibleIndex >= 0 && !foundIndex)) && obj.dash_manifest && typeof obj.dash_manifest === 'string' && obj.dash_manifest.length > 50 && (obj.dash_manifest.includes('<MPD') || obj.dash_manifest.includes('<Period'))) {
                    if (!foundDash) foundDash = obj.dash_manifest;
                    if (possibleIndex >= 0) foundIndex = possibleIndex + 1;
                }

                // Extract video URL
                if ((!foundUrl || (possibleIndex >= 0 && !foundIndex)) && obj.video_versions && Array.isArray(obj.video_versions) && obj.video_versions.length > 0 && obj.video_versions[0].url) {
                    if (!foundUrl) foundUrl = obj.video_versions[0].url;
                    if (possibleIndex >= 0) foundIndex = possibleIndex + 1;
                }
                if ((!foundUrl || (possibleIndex >= 0 && !foundIndex)) && obj.video_url && typeof obj.video_url === 'string' && obj.video_url.startsWith('http')) {
                    if (!foundUrl) foundUrl = obj.video_url;
                    if (possibleIndex >= 0) foundIndex = possibleIndex + 1;
                }

                // Extract image URL (carousel image slides or image-only posts).
                // CRITICAL: filter by posterSig so carousel slide 2+ picks the right image,
                // not slide 1 which appears first in the array.
                if ((!foundUrl || (possibleIndex >= 0 && !foundIndex)) && obj.image_versions2 && obj.image_versions2.candidates && Array.isArray(obj.image_versions2.candidates) && obj.image_versions2.candidates.length > 0) {
                    let candidates = obj.image_versions2.candidates;
                    let picked = null;
                    if (posterSig) {
                        picked = candidates.find(c => c.url && c.url.includes(posterSig));
                        // If posterSig was provided but didn't match any candidate here, 
                        // this is the wrong slide! We must NOT fallback.
                    } else {
                        picked = candidates.reduce((best, c) => ((c.width || 0) * (c.height || 0)) > ((best.width || 0) * (best.height || 0)) ? c : best, candidates[0]);
                    }
                    if (picked && picked.url) {
                        if (!foundUrl) foundUrl = picked.url;
                        if (possibleIndex >= 0) foundIndex = possibleIndex + 1;
                    }
                }

                if ((!foundUrl || (possibleIndex >= 0 && !foundIndex)) && obj.display_url && typeof obj.display_url === 'string' && obj.display_url.startsWith('http')) {
                    if (!foundUrl) foundUrl = obj.display_url;
                    if (possibleIndex >= 0) foundIndex = possibleIndex + 1;
                }

                // Got what we need (video: need dash+user+time; image: need url+user+time)
                if ((foundDash && foundUser && foundTime) || (foundUrl && foundUser && foundTime && !obj.video_versions && !obj.video_url)) return;

                for (let k of Object.keys(obj)) {
                    try {
                        if (obj[k] && typeof obj[k] === 'object') {
                            searchProps(obj[k], depth + 1, visited, myCode, possibleIndex);
                            if (foundDash && foundUser && foundTime) return;
                        }
                    } catch (e) { }
                }
            }

            // Walk up the fiber tree from the video element
            let fiber = getFiber(el);
            let fiberSteps = 0;
            while (fiber && fiberSteps < 200) {
                fiberSteps++;

                // Search memoizedProps (the actual data passed to this component)
                if (fiber.memoizedProps && typeof fiber.memoizedProps === 'object') {
                    searchProps(fiber.memoizedProps, 0, new Set());
                }

                // Search pendingProps as fallback
                if (fiber.pendingProps && typeof fiber.pendingProps === 'object' && fiber.pendingProps !== fiber.memoizedProps) {
                    searchProps(fiber.pendingProps, 0, new Set());
                }

                if ((foundDash || foundUrl) && foundUser && foundTime) {
                    break;
                }

                fiber = fiber.return; 
            }

            // Fallback: For absolutely positioned videos or portals where the element's 
            // Fiber tree doesn't connect to the Post's data, search the parent article's Fiber tree.
            // This is crucial because we ALREADY extracted foundDash/foundUrl from the video, 
            // and now we use it to match the exact index inside the article's carouselArray.
            if (!(foundUser && foundTime)) {
                let article = el.closest('article, [role="dialog"]');
                if (article) {
                    let articleFiber = getFiber(article);
                    let articleSteps = 0;
                    while (articleFiber && articleSteps < 200) {
                        articleSteps++;
                        if (articleFiber.memoizedProps && typeof articleFiber.memoizedProps === 'object') {
                            searchProps(articleFiber.memoizedProps, 0, new Set());
                        }
                        // We do not break on foundDash/foundUrl alone, we need user and time.
                        if (foundUser && foundTime) {
                            break;
                        }
                        articleFiber = articleFiber.return;
                    }
                }
            }

            // === PHASE 2: If fiber walk failed, try DOM walk but with strict shortcode guard ===
            if (!(foundDash && foundUser && foundTime) && !foundUrl) {
                expectedShortcode = foundCode || event.data.shortcode;
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

                    // STRICT POSTER GUARD (For Carousels):
                    if (posterSig && (obj.image_versions2 || obj.video_versions)) {
                        let hasMatch = false;
                        if (obj.image_versions2 && obj.image_versions2.candidates && Array.isArray(obj.image_versions2.candidates)) {
                            hasMatch = hasMatch || obj.image_versions2.candidates.some(c => c.url && c.url.includes(posterSig));
                        }
                        if (obj.video_versions && Array.isArray(obj.video_versions)) {
                            hasMatch = hasMatch || obj.video_versions.some(v => v.url && v.url.includes(posterSig));
                        }
                        if (!hasMatch) return; // Wrong slide! Skip this entire object.
                    }

                    if (!foundDash && obj.video_dash_manifest && typeof obj.video_dash_manifest === 'string') foundDash = obj.video_dash_manifest;
                    if (!foundDash && obj.dash_manifest && typeof obj.dash_manifest === 'string') foundDash = obj.dash_manifest;
                    if (!foundUrl && obj.video_versions && Array.isArray(obj.video_versions) && obj.video_versions.length > 0 && obj.video_versions[0].url) foundUrl = obj.video_versions[0].url;
                    if (!foundUrl && obj.video_url && typeof obj.video_url === 'string' && obj.video_url.startsWith('http')) foundUrl = obj.video_url;
                    // Extract image URL for carousel image slides.
                    // CRITICAL: filter by posterSig so carousel slide 2+ picks the right image.
                    if (!foundUrl && obj.image_versions2 && obj.image_versions2.candidates && Array.isArray(obj.image_versions2.candidates) && obj.image_versions2.candidates.length > 0) {
                        let candidates = obj.image_versions2.candidates;
                        let picked = null;
                        if (posterSig) {
                            picked = candidates.find(c => c.url && c.url.includes(posterSig));
                        } else {
                            picked = candidates.reduce((best, c) => ((c.width || 0) * (c.height || 0)) > ((best.width || 0) * (best.height || 0)) ? c : best, candidates[0]);
                        }
                        if (picked && picked.url) foundUrl = picked.url;
                    }

                    let objId = obj.pk || obj.media_id || obj.item_id;
                    if (objId && (typeof objId === 'string' || typeof objId === 'number')) {
                        let strId = String(objId);
                        if (strId.match(/^\d+(_\d+)?$/) && !foundId) foundId = strId;
                    }
                    if (!foundCode && obj.code && typeof obj.code === 'string' && obj.code.length >= 10 && obj.code.length <= 50) foundCode = obj.code;

                    if (!foundUser && obj.user && obj.user.username) foundUser = obj.user.username;
                    else if (!foundUser && obj.owner && obj.owner.username) foundUser = obj.owner.username;
                    else if (!foundUser && obj.author && obj.author.username) foundUser = obj.author.username;
                    else if (!foundUser && obj.username && typeof obj.username === 'string' && !obj.username.includes(' ')) foundUser = obj.username;

                    if (!foundTime && obj.taken_at) foundTime = obj.taken_at;
                    else if (!foundTime && obj.taken_at_timestamp) foundTime = obj.taken_at_timestamp;
                    else if (!foundTime && obj.device_timestamp) foundTime = obj.device_timestamp;

                    if ((foundDash && foundUser && foundTime) || (foundUrl && foundUser && foundTime)) return;
                    for (let k of Object.keys(obj)) { try { if (obj[k] && typeof obj[k] === 'object') { searchObjStrict(obj[k], depth + 1); if ((foundDash && foundUser && foundTime) || (foundUrl && foundUser && foundTime)) return; } } catch (e) { } }
                }

                let current = el;
                let maxDomDepth = 50;
                while (current && current !== document.body && maxDomDepth > 0 && !(foundDash && foundUser && foundTime)) {
                    for (let k of Object.keys(current)) {
                        if (k.startsWith('__reactProps$') && current[k]) {
                            searchObjStrict(current[k], 0);
                            if (foundDash && foundUser && foundTime) break;
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
                    if (!foundCode && foundObj.code && typeof foundObj.code === 'string' && foundObj.code.length <= 50) foundCode = foundObj.code;
                }
            }

            if (foundUrl || foundDash) {
                window.postMessage({ type: 'MD_FIBER_RESULT', id: id, url: foundUrl, dash: foundDash, media_id: foundId, shortcode: foundCode, index: foundIndex }, '*');
            } else {
                window.postMessage({ type: 'MD_FIBER_RESULT', id: id, error: true, media_id: foundId, shortcode: foundCode }, '*');
            }
        } catch (e) { }
    }
});

export function showGhostToast(icon, color) {
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

export function isPresenceRequest(url, body) {
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

export function isSeenRequest(url, body) {
    let urlStr = (url || "").toString().toLowerCase();
    let bodyStr = (body || "").toString().toLowerCase();

    let targetUsername = null;
    try {
        let bStr = typeof body === 'string' ? body : bodyStr;
        let match = bStr.match(/"(?:reel_id|media_id)"\s*:\s*"([^"]+)"/);
        if (!match) {
            try { match = decodeURIComponent(bStr).match(/"(?:reel_id|media_id)"\s*:\s*"([^"]+)"/); } catch(e) {}
        }
        if (match && match[1]) {
            let id = match[1].includes('_') ? match[1].split('_')[0] : match[1];
            if (window.__md_storyMedia && window.__md_storyMedia[id]) {
                targetUsername = window.__md_storyMedia[id].username;
            }
        }
    } catch(e) {}

    let isStorySeen = bodyStr.includes('usepolarisstoriesv3seen') ||
                      bodyStr.includes('storiesseen') ||
                      bodyStr.includes('storyseen') ||
                      bodyStr.includes('story_seen') ||
                      bodyStr.includes('xdtstoryseen') ||
                      bodyStr.includes('xdtstorylike') ||
                      bodyStr.includes('usepolarisstorylike') ||
                      bodyStr.includes('ig_reels_video_view') ||
                      bodyStr.includes('ig_story_view') ||
                      bodyStr.includes('view_seen_at') ||
                      bodyStr.includes('viewseenat') ||
                      urlStr.includes('stories/reels/seen') ||
                      urlStr.includes('v2/reels/seen') ||
                      urlStr.includes('/api/v1/media/seen') ||
                      urlStr.includes('/api/v1/stories/seen');

    let isDMSeen = bodyStr.includes('usepolarisdirectthreadmarkreadmutation') ||
                   bodyStr.includes('directthreadmarkreadmutation') ||
                   urlStr.includes('threads/broadcast/mark_seen') ||
                   (urlStr.includes('direct_v2/threads') && urlStr.includes('/seen'));

    if (window.__md_vanishMode && isStorySeen) return { blocked: true, type: 'story', username: targetUsername };
    // Extract User IDs for direct messaging marking
    if (window.__md_ghostSeen && isDMSeen) return { blocked: true, type: 'dm' };
    if (window.__md_ghostSeen && isStorySeen) return { blocked: true, type: 'story', username: targetUsername }; // Fallback

    return { blocked: false };
}

window.__md_applyGhostVisuals = function() {
    let seenUsers = {};
    try {
        seenUsers = JSON.parse(localStorage.getItem('md_ghost_seen_users') || '{}');
    } catch(e) {}
    
    let now = Date.now();
    let updated = false;
    for (let u in seenUsers) {
        let seenTime = typeof seenUsers[u] === 'object' ? seenUsers[u].seenAt : seenUsers[u];
        if (now - seenTime > 86400000) { // 24 hours
            delete seenUsers[u];
            updated = true;
        }
    }
    if (updated) localStorage.setItem('md_ghost_seen_users', JSON.stringify(seenUsers));
    
    let users = Object.keys(seenUsers);
    
    let styleEl = document.getElementById('md-ghost-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'md-ghost-styles';
        document.head.appendChild(styleEl);
    }

    if (users.length === 0) {
        styleEl.textContent = '';
        return;
    }
    
    let css = users.map(u => {
        let alt1 = `[alt$=" ${u}"]`;
        let alt2 = `[alt^="${u}'s "]`;
        return `
        a[href^="/stories/${u}/"] canvas,
        header :has(img[alt*="${u}"]) canvas,
        [role="button"]:has(img[alt*="${u}"]):not(:has(video)) canvas,
        button:has(img[alt*="${u}"]):not(:has(video)) canvas { 
            filter: grayscale(100%) contrast(0) brightness(1.6) !important; 
            opacity: 0.15 !important;
            transition: all 0.5s ease;
        }
    `}).join('\n');
    
    if (styleEl.textContent !== css) {
        styleEl.textContent = css;
    }
};

function isViewingLastStorySegment() {
    // Method 1: Check our custom counter element from video_progress.js (e.g. "2/5", "5/5", "1/1")
    let counter = document.querySelector('#md-story-counter');
    if (counter && counter.textContent && counter.textContent.includes('/')) {
        let parts = counter.textContent.split('/');
        let cur = parseInt(parts[0], 10);
        let total = parseInt(parts[1], 10);
        if (!isNaN(cur) && !isNaN(total) && total > 0) {
            return { isLast: cur >= total, cur, total };
        }
    }

    // Method 2: Check native segment bars at the top of the story viewer
    let allDivs = document.querySelectorAll('div');
    for (let d of allDivs) {
        if (d.children.length === 0 || d.children.length > 150) continue;
        let rect = d.getBoundingClientRect();
        if (rect.width > 100 && rect.top >= -20 && rect.top < 150 && rect.height > 0 && rect.height <= 35) {
            let style = window.getComputedStyle(d);
            if (style.display === 'flex' || style.display === 'grid') {
                let firstChild = d.children[0];
                if (firstChild && firstChild.id !== 'md-story-progress-container') {
                    let cr = firstChild.getBoundingClientRect();
                    if (cr.height > 0 && cr.height <= 20 && cr.width >= 1) {
                        let segs = Array.from(d.children).filter(c => c.id !== 'md-story-progress-container');
                        let total = segs.length;
                        if (total > 1) {
                            for (let i = 0; i < total - 1; i++) {
                                let s = segs[i];
                                let inner = s.querySelector('div, span');
                                if (inner) {
                                    let pRect = s.getBoundingClientRect();
                                    let iRect = inner.getBoundingClientRect();
                                    // If an earlier segment is less than 95% full or actively animating, we are NOT on the last segment
                                    if (pRect.width > 0 && (iRect.width / pRect.width) < 0.95) {
                                        return { isLast: false, cur: i + 1, total };
                                    }
                                }
                            }
                        }
                        return { isLast: true, cur: total, total };
                    }
                }
            }
        }
    }
    
    // Default to true if unable to find multiple segments (single story case)
    return { isLast: true, cur: 1, total: 1 };
}

window.__md_markStoryAsGhostSeen = function(networkUsername = null) {
    let username = networkUsername;
    if (!username) {
        let match = window.location.href.match(/\/stories\/([^\/]+)\//);
        if (!match) return;
        username = match[1];
    }
    
    let segInfo = isViewingLastStorySegment();
    let seenUsers = {};
    try {
        seenUsers = JSON.parse(localStorage.getItem('md_ghost_seen_users') || '{}');
    } catch(e) {}

    // Only turn icon gray if the user has reached the final story of this author!
    if (!segInfo.isLast) {
        mdLog("👀 Story Protected", `@${username} slide (${segInfo.cur}/${segInfo.total}) viewed in stealth — Ring stays colorful`, "#3b82f6");
        if (seenUsers[username]) {
            delete seenUsers[username];
            localStorage.setItem('md_ghost_seen_users', JSON.stringify(seenUsers));
            window.__md_applyGhostVisuals();
        }
        return;
    }
    
    seenUsers[username] = Date.now();
    localStorage.setItem('md_ghost_seen_users', JSON.stringify(seenUsers));
    
    // Notify content script to save in extension storage
    window.postMessage({ type: 'MD_GHOST_HISTORY_ADD', username: username, timestamp: Date.now() }, '*');

    window.__md_applyGhostVisuals();
    mdLog("👻 Story Completed", `All stories viewed (${segInfo.cur}/${segInfo.total}) for @${username} — Ring changed to gray`, "#8b5cf6");
};

window.__md_lastGhostBlock = 0;
window.__md_handleGhostBlock = function(type, networkUsername = null) {
    let now = Date.now();
    if (type === 'story') {
        window.__md_markStoryAsGhostSeen(networkUsername);
    }
    if (now - window.__md_lastGhostBlock > 2000) {
        mdLog(type === 'story' ? "👻 Story Shield" : "💬 DM Shield", `Blocked outgoing request to mark ${type} as seen`, "#f59e0b");
        showGhostToast(type === 'story' ? "👻" : "👀", "#0f172a");
        window.__md_lastGhostBlock = now;
    }
};

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
            mdLog("🟢 Presence Shield", "Blocked Beacon request to broadcast presence (status offline)", "#10b981");
            showGhostToast("🟢", "#064e3b");
            return true;
        }

        let seenCheck = isSeenRequest(url, bodyStr);
        if (seenCheck.blocked) {
            window.__md_handleGhostBlock(seenCheck.type, seenCheck.username);
            return true; // Fake success
        }
        return originalSendBeacon.apply(this, arguments);
    };
}

// ==========================================
// Intercept Fetch
// ==========================================
window.__md_storyMedia = {};

export function extractSignatureFromUrl(url) {
    if (!url) return null;
    try {
        let parts = new URL(url).pathname.split('/');
        return parts[parts.length - 1];
    } catch (e) {
        let match = url.match(/\/([^\/]+\.(jpg|webp|mp4))/);
        return match ? match[1] : null;
    }
}

let globalFoundUsername = "";
let globalFoundTimestamp = null;

export function findStoryMedia(obj, parentUsername = "", parentTimestamp = null, checkResetFn = null) {
    if (!obj || typeof obj !== 'object') return;

    let currentUsername = parentUsername;
    let currentTimestamp = parentTimestamp;

    if (obj.user && obj.user.username) currentUsername = obj.user.username;
    else if (obj.owner && obj.owner.username) currentUsername = obj.owner.username;
    else if (obj.author && obj.author.username) currentUsername = obj.author.username;
    else if (obj.username && typeof obj.username === 'string' && !obj.username.includes(' ')) currentUsername = obj.username;

    if (obj.latest_reel_media && checkResetFn) checkResetFn(currentUsername, obj.latest_reel_media);
    if (obj.taken_at) currentTimestamp = obj.taken_at;
    else if (obj.taken_at_timestamp) currentTimestamp = obj.taken_at_timestamp;
    else if (obj.device_timestamp) currentTimestamp = obj.device_timestamp;

    if (currentUsername && currentTimestamp && checkResetFn) {
        checkResetFn(currentUsername, currentTimestamp);
    }

    if ((obj.video_versions || obj.image_versions2) && (obj.id || obj.pk)) {
        let id = obj.id || obj.pk;
        if (typeof id === 'string' && id.includes('_')) id = id.split('_')[0];

        let signatures = [];

        let sharedItem = null;
        let feedAtt = (obj.story_feed_media && obj.story_feed_media[0]) || (obj.reeling_media && obj.reeling_media[0]) || (obj.story_reels_media && obj.story_reels_media[0]) || obj.media_mentions;
        if (feedAtt) {
            let isReel = !!(obj.reeling_media || obj.story_reels_media);
            let code = feedAtt.media_code || feedAtt.shortcode || feedAtt.code;
            let uname = (feedAtt.user && feedAtt.user.username) || (feedAtt.owner && feedAtt.owner.username) || "";
            let href = code ? (isReel ? `https://www.instagram.com/reel/${code}/` : `https://www.instagram.com/p/${code}/`) : null;
            let label = uname ? `@${uname}` : (isReel ? 'Watch Reel' : 'See Post');
            sharedItem = { isReel, label, href };
        }

        let mediaObj = {
            url: "",
            username: currentUsername || "",
            timestamp: currentTimestamp || Math.floor(Date.now() / 1000),
            shortcode: obj.code || obj.shortcode || id,
            media_id: id,
            dash_manifest: obj.video_dash_manifest || null,
            signatures: signatures,
            shared_item: sharedItem
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
            findStoryMedia(obj[k], currentUsername, currentTimestamp, checkResetFn);
        }
    }
}

export function processAndPostData(data) {
    if (!data) return;
    
    let seenUsers = {};
    let seenModified = false;
    try {
        seenUsers = JSON.parse(localStorage.getItem('md_ghost_seen_users') || '{}');
    } catch(e) {}
    
    let seenKeys = Object.keys(seenUsers);
    let checkResetFn = null;
    if (seenKeys.length > 0) {
        checkResetFn = function(uname, ts) {
            if (!uname || !ts || !seenUsers[uname]) return;
            let seenTime = typeof seenUsers[uname] === 'object' ? seenUsers[uname].seenAt : seenUsers[uname];
            let tsMs = ts > 100000000000 ? ts : ts * 1000;
            if (tsMs > seenTime + 5000) { // New story uploaded after previous view
                delete seenUsers[uname];
                seenModified = true;
                mdLog("✨ Story Alert", `New story posted by @${uname} after previous view — Ring restored to colorful`, "#06b6d4");
            }
        };
    }
    
    findStoryMedia(data, "", null, checkResetFn);
    
    if (seenModified) {
        try {
            localStorage.setItem('md_ghost_seen_users', JSON.stringify(seenUsers));
            window.__md_applyGhostVisuals();
        } catch(e) {}
    }
    
    window.postMessage({ type: 'MD_STORY_MEDIA_UPDATE', media: window.__md_storyMedia }, '*');
}

