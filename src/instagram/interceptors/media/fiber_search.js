import { logError, logErrorOnce } from '../shared/logger.js';
import { pickBestImageUrl, pickBestVideoUrl } from './media_quality.js';
import { extractMediaTimestamp } from '../shared/time_utils.js';
window.addEventListener('message', function(event) {
    // Only our own window may request a fiber walk (rejects openers/iframes; also avoids a TypeError on null data).
    if (event.source !== window || !event.data) return;
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
                if (obj.code && typeof obj.code === 'string' && obj.code.length >= 10 && obj.code.length <= 50 && !/^\d+$/.test(obj.code)) myCode = obj.code;
                else if (obj.shortcode && typeof obj.shortcode === 'string' && obj.shortcode.length >= 10 && obj.shortcode.length <= 50 && !/^\d+$/.test(obj.shortcode)) myCode = obj.shortcode;

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
                
                if (!foundTime) foundTime = extractMediaTimestamp(obj);

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
                        } catch (err) { logErrorOnce('Fiber: carousel item', err); /* exotic React props can throw on access */ }
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
                        } catch (err) { logErrorOnce('Fiber: carousel sibling prop', err); }
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

                // Extract video URL (highest resolution, never blindly [0])
                let bestVideoUrl = pickBestVideoUrl(obj.video_versions);
                if ((!foundUrl || (possibleIndex >= 0 && !foundIndex)) && bestVideoUrl) {
                    if (!foundUrl) foundUrl = bestVideoUrl;
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
                    // With posterSig only this slide's candidates are eligible (no match = wrong slide,
                    // so no fallback); among them the LARGEST wins, not the first one listed.
                    let pickedUrl = pickBestImageUrl(obj.image_versions2.candidates, posterSig || null);
                    if (pickedUrl) {
                        if (!foundUrl) foundUrl = pickedUrl;
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
                    } catch (err) { logErrorOnce('Fiber: prop walk', err); }
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
                    if (!foundUrl) foundUrl = pickBestVideoUrl(obj.video_versions) || "";
                    if (!foundUrl && obj.video_url && typeof obj.video_url === 'string' && obj.video_url.startsWith('http')) foundUrl = obj.video_url;
                    // Extract image URL for carousel image slides.
                    // CRITICAL: filter by posterSig so carousel slide 2+ picks the right image; largest match wins.
                    if (!foundUrl && obj.image_versions2 && Array.isArray(obj.image_versions2.candidates)) {
                        foundUrl = pickBestImageUrl(obj.image_versions2.candidates, posterSig || null) || "";
                    }

                    let objId = obj.pk || obj.media_id || obj.item_id;
                    if (objId && (typeof objId === 'string' || typeof objId === 'number')) {
                        let strId = String(objId);
                        if (strId.match(/^\d+(_\d+)?$/) && !foundId) foundId = strId;
                    }
                    if (!foundCode && obj.code && typeof obj.code === 'string' && obj.code.length >= 10 && obj.code.length <= 50 && !/^\d+$/.test(obj.code)) foundCode = obj.code;

                    if (!foundUser && obj.user && obj.user.username) foundUser = obj.user.username;
                    else if (!foundUser && obj.owner && obj.owner.username) foundUser = obj.owner.username;
                    else if (!foundUser && obj.author && obj.author.username) foundUser = obj.author.username;
                    else if (!foundUser && obj.username && typeof obj.username === 'string' && !obj.username.includes(' ')) foundUser = obj.username;

                    if (!foundTime) foundTime = extractMediaTimestamp(obj);

                    if ((foundDash && foundUser && foundTime) || (foundUrl && foundUser && foundTime)) return;
                    for (let k of Object.keys(obj)) { try { if (obj[k] && typeof obj[k] === 'object') { searchObjStrict(obj[k], depth + 1); if ((foundDash && foundUser && foundTime) || (foundUrl && foundUser && foundTime)) return; } } catch (err) { logErrorOnce('Fiber: DOM props walk', err); } }
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
                    for (let k of keys) { try { if (obj[k] && typeof obj[k] === 'object') searchInitial(obj[k], depth + 1); } catch (err) { logErrorOnce('Fiber: initial data walk', err); } }
                }

                if (window.__initialData) searchInitial(window.__initialData, 0);
                if (!foundObj && window._sharedData) searchInitial(window._sharedData, 0);

                if (foundObj) {
                    if (foundObj.video_dash_manifest) foundDash = foundObj.video_dash_manifest;
                    else if (foundObj.dash_manifest) foundDash = foundObj.dash_manifest;
                    let bestInitialVideoUrl = pickBestVideoUrl(foundObj.video_versions);
                    if (bestInitialVideoUrl) {
                        foundUrl = bestInitialVideoUrl;
                    } else if (foundObj.video_url) {
                        foundUrl = foundObj.video_url;
                    }
                    if (!foundCode && foundObj.code && typeof foundObj.code === 'string' && foundObj.code.length <= 50 && !/^\d+$/.test(foundObj.code)) foundCode = foundObj.code;
                }
            }

            if (foundUrl || foundDash) {
                window.postMessage({ type: 'MD_FIBER_RESULT', id: id, url: foundUrl, dash: foundDash, media_id: foundId, shortcode: foundCode, index: foundIndex, user: foundUser || null, time: foundTime || null }, '/');
            } else {
                window.postMessage({ type: 'MD_FIBER_RESULT', id: id, error: true, media_id: foundId, shortcode: foundCode }, '/');
            }
        } catch (err) { logError('Fiber: request', err); window.postMessage({ type: 'MD_FIBER_RESULT', id: event.data.id, error: true }, '/'); }
    }
});

