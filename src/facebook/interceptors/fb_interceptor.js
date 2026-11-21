(function () {
    console.log("FB Interceptor Loaded");

    window.__FB_JSON_CACHE__ = window.__FB_JSON_CACHE__ || [];
    window.__fb_ghostSeen = false;
    window.__fb_ghostPresence = false;

    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) return;
        if (event.data.type === 'FB_GHOST_SEEN_TOGGLE') {
            window.__fb_ghostSeen = event.data.enabled;
        }
        if (event.data.type === 'FB_GHOST_PRESENCE_TOGGLE') {
            window.__fb_ghostPresence = event.data.enabled;
        }
    });

    // --- Ghost Mode Helpers ---

    function isFBSeenRequest(url, bodyStr) {
        if (!window.__fb_ghostSeen) return false;
        let urlStr = (url || '').toLowerCase();
        let bStr = (bodyStr || '').toString();
        if (urlStr.includes('mark_read') || urlStr.includes('mark_seen') || urlStr.includes('stories/seen') || urlStr.includes('thread_read')) return true;
        if (bStr.includes('StoryViewerSeenMutation') || bStr.includes('useMessagesMarkThreadReadMutation') || bStr.includes('MessengerMarkThreadReadMutation')) return true;
        return false;
    }

    function isFBPresenceRequest(url, bodyStr) {
        if (!window.__fb_ghostPresence) return false;
        let urlStr = (url || '').toLowerCase();
        let bStr = (bodyStr || '').toString();
        if (urlStr.includes('/ajax/presence/update') || urlStr.includes('/bwe/')) return true;
        if (bStr.includes('UpdatePresenceMutation') || bStr.includes('SetPresenceMutation') || bStr.includes('presence_update')) return true;
        return false;
    }

    // --- Media Extraction Helpers ---

    /**
     * Extracts HD and SD video URLs from a Facebook media GraphQL object.
     * Follows the hierarchy: progressive_urls > playable_url_quality_hd > playable_url.
     * @param {object} mediaObj - The GraphQL media node.
     * @returns {{ hdUrl: string|null, sdUrl: string|null }}
     */
    function extractVideoUrls(mediaObj) {
        let hdUrl = null;
        let sdUrl = null;

        const progressiveUrls = mediaObj?.videoDeliveryResponseFragment?.videoDeliveryResponseResult?.progressive_urls;
        if (Array.isArray(progressiveUrls)) {
            for (let item of progressiveUrls) {
                if (item?.metadata?.quality === "HD" && item.progressive_url) {
                    hdUrl = item.progressive_url;
                } else if (item?.metadata?.quality === "SD" && item.progressive_url && !sdUrl) {
                    sdUrl = item.progressive_url;
                }
            }
        }

        if (!hdUrl && mediaObj?.playable_url_quality_hd) hdUrl = mediaObj.playable_url_quality_hd;
        if (!hdUrl && mediaObj?.browser_native_hd_url) hdUrl = mediaObj.browser_native_hd_url;
        if (!sdUrl && mediaObj?.playable_url) sdUrl = mediaObj.playable_url;
        if (!sdUrl && mediaObj?.browser_native_sd_url) sdUrl = mediaObj.browser_native_sd_url;

        if (!hdUrl && !sdUrl && mediaObj?.progressive_url) {
            if (mediaObj.metadata && mediaObj.metadata.quality === 'HD') hdUrl = mediaObj.progressive_url;
            else sdUrl = mediaObj.progressive_url;
        }

        return { hdUrl, sdUrl };
    }

    /**
     * Recursively searches a JSON object tree for a story node matching the target ID.
     * Normalizes base64 padding before comparison.
     * @param {object} obj - The JSON object to search.
     * @param {string} targetId - The story ID to match (e.g. "UzpfSVND...").
     * @param {WeakSet} [seen] - Cycle protection set.
     * @param {number} [depth] - Current recursion depth.
     * @returns {object|null} The matching story/media node, or null.
     */
    function findStoryNode(obj, targetId, seen = new WeakSet(), depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 15 || seen.has(obj)) return null;
        seen.add(obj);

        let currentId = obj.id || obj.story_card_id || obj.story_id;
        if (currentId && currentId.toString().replace(/=+$/, '') === targetId.replace(/=+$/, '')) {
            // Found a node with matching ID — check if it contains media
            if (obj.progressive_urls || obj.playable_url || obj.playable_url_quality_hd || obj.videoDeliveryResponseFragment) return obj;
            if (obj.__typename === "Video" || obj.__typename === "Photo") return obj;
            if (obj.attachments?.[0]?.media) return obj.attachments[0].media;
        }

        for (let key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                let result = findStoryNode(obj[key], targetId, seen, depth + 1);
                if (result) return result;
            }
        }
        return null;
    }

    /**
     * DOM Viewport Intersection Strategy
     * Scans the DOM for the largest visible media element (Image or Video).
     * @returns {{ mediaUrl: string, mediaType: string }|null}
     */
    function extractFromDOM() {
        let maxArea = 0;
        let bestMedia = null;
        let isVideo = false;

        // Scan images
        let imgs = document.querySelectorAll('img');
        for (let img of imgs) {
            if (img.src && !img.src.includes('static.xx.fbcdn.net') && !img.src.startsWith('data:')) {
                let rect = img.getBoundingClientRect();
                let area = rect.width * rect.height;
                // Use 50px threshold to ignore thumbnails and icons but catch ultra-wide/tall aspect ratios
                if (area > maxArea && rect.top >= 0 && rect.width > 50 && rect.height > 50) {
                    maxArea = area;
                    bestMedia = img;
                    isVideo = false;
                }
            }
        }

        // Scan videos
        let videos = document.querySelectorAll('video');
        for (let v of videos) {
            let rect = v.getBoundingClientRect();
            let area = rect.width * rect.height;
            if (area > maxArea && rect.top >= 0 && rect.width > 50 && rect.height > 50) {
                maxArea = area;
                bestMedia = v;
                isVideo = true;
            }
        }

        if (bestMedia) {
            let src = bestMedia.src || bestMedia.currentSrc;
            
            // Scan GraphQL cache backwards for the most recent media node to extract true ID and timestamp
            let latestVideoUrl = null;
            let latestDash = null;
            let latestId = null;
            let latestCreationTime = null;
            let latestUsername = null;
            let cache = window.__FB_JSON_CACHE__ || {};
            
            function searchCacheForMedia(obj, parentStory) {
                if (!obj || typeof obj !== 'object') return;
                
                let currentStory = parentStory;
                if (obj.__typename === "Story" || obj.creation_time) {
                    currentStory = obj;
                }

                if (isVideo && (obj.__typename === "Video" || obj.playable_url || obj.dash_manifest || obj.videoDeliveryResponseFragment)) {
                    let urls = extractVideoUrls(obj);
                    let dash = obj.dash_manifest || obj.videoDeliveryResponseFragment?.videoDeliveryResponseResult?.dash_manifest;
                    if (urls.hdUrl || urls.sdUrl || dash) {
                        latestVideoUrl = urls.hdUrl || urls.sdUrl;
                        if (dash && typeof dash === 'string') {
                            latestDash = dash.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                        }
                        if (currentStory) {
                            let rawId = currentStory.id || currentStory.story_id;
                            latestId = rawId ? rawId.toString().split('?')[0].split('&')[0].split('/')[0].split('#')[0] : null;
                            latestCreationTime = currentStory.creation_time;
                            if (currentStory.story_bucket_owner && currentStory.story_bucket_owner.name) {
                                latestUsername = currentStory.story_bucket_owner.name;
                            } else if (currentStory.actors && currentStory.actors[0] && currentStory.actors[0].name) {
                                latestUsername = currentStory.actors[0].name;
                            }
                        }
                        return;
                    }
                } else if (!isVideo && obj.image && obj.image.uri) {
                    let cacheUri = obj.image.uri.split('?')[0];
                    let domUri = src ? src.split('?')[0] : "";
                    if (cacheUri === domUri || (!domUri && obj.__typename === "Photo")) {
                        if (currentStory) {
                            let rawId = currentStory.id || currentStory.story_id;
                            latestId = rawId ? rawId.toString().split('?')[0].split('&')[0].split('/')[0].split('#')[0] : null;
                            latestCreationTime = currentStory.creation_time;
                            if (currentStory.story_bucket_owner && currentStory.story_bucket_owner.name) {
                                latestUsername = currentStory.story_bucket_owner.name;
                            } else if (currentStory.actors && currentStory.actors[0] && currentStory.actors[0].name) {
                                latestUsername = currentStory.actors[0].name;
                            }
                        }
                        return;
                    }
                }
                
                for (let key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                        searchCacheForMedia(obj[key], currentStory);
                        if ((isVideo && (latestVideoUrl || latestDash)) || (!isVideo && latestId)) return;
                    }
                }
            }
            
            if (Array.isArray(cache)) {
                for (let i = cache.length - 1; i >= 0; i--) {
                    searchCacheForMedia(cache[i], null);
                    if ((isVideo && (latestVideoUrl || latestDash)) || (!isVideo && latestId)) break;
                }
            }
            
            let cacheMeta = {};
            if (latestId) {
                latestId = latestId.toString().split('?')[0].split('&')[0].split('/')[0];
                cacheMeta.shortcode = latestId;
            }
            if (latestCreationTime) cacheMeta.timestamp = latestCreationTime;
            if (latestUsername) cacheMeta.username = latestUsername.replace(/[^a-zA-Z0-9_.]/g, '_').toLowerCase();

            if (isVideo && src && src.startsWith('blob:')) {
                if (latestVideoUrl || latestDash) {
                    return { mediaUrl: latestVideoUrl || null, mediaType: 'video', dash_manifest: latestDash, cache_metadata: cacheMeta };
                }
            } else if (src && src.startsWith('http')) {
                return { mediaUrl: src, mediaType: isVideo ? 'video' : 'image', cache_metadata: cacheMeta };
            }
        }
        return null;
    }

    // --- Network Interceptors ---

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        let url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        let body = args[1]?.body || '';
        let bodyStr = typeof body === 'string' ? body : '';

        if (isFBSeenRequest(url, bodyStr)) return new Response(JSON.stringify({ data: { success: true } }), { status: 200, statusText: 'OK' });
        if (isFBPresenceRequest(url, bodyStr)) return new Response(JSON.stringify({ data: { success: true } }), { status: 200, statusText: 'OK' });

        const response = await originalFetch.apply(this, args);
        try {
            const contentType = response.headers.get('Content-Type') || '';
            if (url.includes('graphql') || contentType.includes('application/json') || contentType.includes('text/javascript')) {
                response.clone().text().then(text => {
                    let cleanText = text.startsWith('for (;;);') ? text.replace('for (;;);', '') : text;
                    try {
                        let json = JSON.parse(cleanText);
                        window.__FB_JSON_CACHE__.push(json);
                        if (window.__FB_JSON_CACHE__.length > 30) window.__FB_JSON_CACHE__.shift();
                    } catch (e) {
                        let lines = cleanText.split('\n');
                        for (let line of lines) {
                            if (!line.trim()) continue;
                            try {
                                let json = JSON.parse(line);
                                window.__FB_JSON_CACHE__.push(json);
                                if (window.__FB_JSON_CACHE__.length > 30) window.__FB_JSON_CACHE__.shift();
                            } catch (err) { if (!(err instanceof SyntaxError)) console.warn('[FB-MD] Stream line handling failed:', err); /* partial/non-JSON lines are expected */ }
                        }
                    }
                }).catch((err) => console.warn('[FB-MD] Could not read intercepted response body:', err));
            }
        } catch (err) { console.warn('[FB-MD] Fetch interception failed:', err); }
        return response;
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._md_url = url;
        if (typeof url === 'string') {
            if (url.includes('video') || url.includes('fbcdn') || url.includes('graphql')) {
                this.addEventListener('load', function () {
                    try {
                        if (this.responseURL && this.responseURL.includes('graphql') && this.responseText) {
                            let cleanText = this.responseText.startsWith('for (;;);') ? this.responseText.replace('for (;;);', '') : this.responseText;
                            try {
                                let json = JSON.parse(cleanText);
                                window.__FB_JSON_CACHE__.push(json);
                                if (window.__FB_JSON_CACHE__.length > 30) window.__FB_JSON_CACHE__.shift();
                            } catch (e) {
                                let lines = cleanText.split('\n');
                                for (let line of lines) {
                                    if (!line.trim()) continue;
                                    try {
                                        let json = JSON.parse(line);
                                        window.__FB_JSON_CACHE__.push(json);
                                        if (window.__FB_JSON_CACHE__.length > 30) window.__FB_JSON_CACHE__.shift();
                                    } catch (err) { if (!(err instanceof SyntaxError)) console.warn('[FB-MD] Stream line handling failed:', err); /* partial/non-JSON lines are expected */ }
                                }
                            }
                        }
                    } catch (err) { console.warn('[FB-MD] XHR interception failed:', err); }
                });
            }
        }
        return origOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
        let url = this._md_url || '';
        let bodyStr = typeof body === 'string' ? body : '';

        if (isFBSeenRequest(url, bodyStr)) {
            Object.defineProperty(this, 'status', { get: () => 200 });
            Object.defineProperty(this, 'readyState', { get: () => 4 });
            Object.defineProperty(this, 'responseText', { get: () => '{"data": {"success": true}}' });
            setTimeout(() => this.dispatchEvent(new Event('load')), 10);
            return;
        }
        if (isFBPresenceRequest(url, bodyStr)) {
            Object.defineProperty(this, 'status', { get: () => 200 });
            Object.defineProperty(this, 'readyState', { get: () => 4 });
            Object.defineProperty(this, 'responseText', { get: () => '{"data": {"success": true}}' });
            setTimeout(() => this.dispatchEvent(new Event('load')), 10);
            return;
        }
        return origSend.call(this, body);
    };

    // --- Story Media Extraction Handler ---

    /**
     * Searches the GraphQL JSON cache for the story matching currentStoryId.
     * Returns { mediaUrl, mediaType, finalMetadata } or null if not found.
     */
    function searchCacheForStory(currentStoryId, finalMetadata) {
        if (!currentStoryId || !window.__FB_JSON_CACHE__ || window.__FB_JSON_CACHE__.length === 0) return null;

        for (let i = window.__FB_JSON_CACHE__.length - 1; i >= 0; i--) {
            let targetMediaObj = findStoryNode(window.__FB_JSON_CACHE__[i], currentStoryId);
            if (!targetMediaObj) continue;

            let mediaUrl = null;
            let mediaType = "video";

            if (targetMediaObj.__typename === "Photo") {
                mediaUrl = targetMediaObj.image?.uri;
                mediaType = "image";
            } else {
                let urls = extractVideoUrls(targetMediaObj);
                mediaUrl = urls.hdUrl || urls.sdUrl;

                let dash = targetMediaObj.dash_manifest
                    || targetMediaObj.videoDeliveryResponseFragment?.videoDeliveryResponseResult?.dash_manifest;
                if (dash && !mediaUrl && typeof dash === 'string') {
                    finalMetadata.dash_manifest = dash.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                }
            }

            if (mediaUrl && mediaUrl.startsWith('blob:')) mediaUrl = null;

            if (mediaUrl || finalMetadata.dash_manifest) {
                return { mediaUrl, mediaType, finalMetadata };
            }
        }
        return null;
    }

    // --- Story Media Extraction Handler ---

    window.addEventListener("message", (event) => {
        if (event.source !== window || !event.data) return;

        const action = event.data.action;
        if (action === "FB_GET_STORY_MEDIA" || action === "FB_GET_STORY_VIDEO" || action === "FB_GET_STORY_IMAGE") {
            let finalMetadata = event.data.metadata || {};

            // Try to find the exact story ID from the visible DOM container (bypasses stale URL issues)
            let activeDataId = null;
            let dataElements = document.querySelectorAll('[data-id^="Uzpf"]');
            for (let el of dataElements) {
                let rect = el.getBoundingClientRect();
                // If it's visible on screen, this is our active story!
                if (rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= (window.innerWidth || document.documentElement.clientWidth)) {
                    activeDataId = el.getAttribute('data-id');
                    break;
                }
            }

            // Extract the current Story ID: DOM data-id > URL match > finalMetadata.shortcode
            let currentUrl = decodeURIComponent(window.location.href);
            let urlIdMatch = currentUrl.match(/Uzpf[a-zA-Z0-9_-]+={0,2}/);
            let currentStoryId = activeDataId || (urlIdMatch ? urlIdMatch[0] : finalMetadata.shortcode);

            if (currentStoryId && currentStoryId.startsWith('Uzpf')) {
                try {
                    let decoded = atob(currentStoryId);
                    let numMatch = decoded.match(/\d+/);
                    if (numMatch) finalMetadata.shortcode = numMatch[0];
                } catch (err) { if (err.name !== 'InvalidCharacterError') console.warn('[FB-MD] Story id decode failed:', err); /* not base64: keep the id as-is */ }
            } else if (currentStoryId) {
                finalMetadata.shortcode = currentStoryId;
            }

            console.log(`[FB Interceptor] Received ${action} for ID: ${currentStoryId}`);

            // Strategy 1 (and only): GraphQL JSON cache
            let result = searchCacheForStory(currentStoryId, finalMetadata);

            if (result) {
                // If action enforces a type, override it
                if (action === "FB_GET_STORY_VIDEO") result.mediaType = "video";
                if (action === "FB_GET_STORY_IMAGE") result.mediaType = "image";

                console.log(`[FB Interceptor] Media extracted successfully from GraphQL cache.`);
                window.postMessage({
                    action: "FB_STORY_RESULT",
                    url: result.mediaUrl,
                    type: result.mediaType,
                    metadata: result.finalMetadata
                }, "*");
            } else {
                console.warn("[FB Interceptor] GraphQL Cache miss. Attempting DOM Viewport Fallback...");
                
                let domResult = extractFromDOM();
                if (domResult) {
                    console.log("[FB Interceptor] DOM Viewport Strategy Success:", domResult.mediaUrl);
                    if (domResult.dash_manifest) {
                        finalMetadata.dash_manifest = domResult.dash_manifest;
                    }
                    if (domResult.cache_metadata) {
                        if (domResult.cache_metadata.shortcode) finalMetadata.shortcode = domResult.cache_metadata.shortcode;
                        if (domResult.cache_metadata.timestamp) finalMetadata.timestamp = domResult.cache_metadata.timestamp;
                        if (domResult.cache_metadata.username) finalMetadata.username = domResult.cache_metadata.username;
                    }
                    window.postMessage({
                        action: "FB_STORY_RESULT",
                        url: domResult.mediaUrl,
                        type: domResult.mediaType,
                        metadata: finalMetadata
                    }, "*");
                } else {
                    console.warn("[FB Interceptor] DOM Fallback failed. Delegating to yt-dlp fallback.");
                    
                    // Fallback to yt-dlp
                    // We send url: null so main.js knows it needs to use yt-dlp on the story_url
                    window.postMessage({
                        action: "FB_STORY_RESULT",
                        url: null,
                        type: action === "FB_GET_STORY_IMAGE" ? "image" : "video",
                        metadata: finalMetadata
                    }, "*");
                }
            }
        }
    });
})();