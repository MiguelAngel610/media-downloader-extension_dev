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
                    } catch (e) { }
                }).catch(() => { });
            }
        } catch (e) { }
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
                            } catch (e) { }
                        }
                    } catch (e) { }
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

    /**
     * Decodes a JSON-escaped string (handles \/ \u0026 etc).
     * @param {string} str - The escaped string.
     * @returns {string} The decoded string.
     */
    function decodeEscapedStr(str) {
        try { return JSON.parse('"' + str + '"'); }
        catch (e) { return str.replace(/\\\//g, '/'); }
    }

    /**
     * STRATEGY 2: Scans inline <script> tags for the story ID and extracts
     * video URLs from the surrounding text using regex.
     * This covers the SSR/hydration case where data is embedded in the HTML
     * and never passes through fetch/XHR.
     * @param {string} storyId - The base64 story ID (Uzpf...).
     * @param {object} finalMetadata - Metadata object to augment with DASH if found.
     * @returns {{ mediaUrl: string, mediaType: string, finalMetadata: object }|null}
     */
    function extractFromInlineScripts(storyId, finalMetadata) {
        if (!storyId) return null;

        // Strip base64 padding for broader matching — the '=' may be encoded as \u003d
        let searchId = storyId.replace(/=+$/, '');
        let scripts = document.querySelectorAll('script:not([src])');

        for (let script of scripts) {
            let text = script.textContent;
            if (!text || text.length < 200 || !text.includes(searchId)) continue;

            console.log("[FB] Found story ID in inline script. Extracting media URLs...");

            // Take a text window around the story ID to scope extraction to the right story
            let idPos = text.indexOf(searchId);
            let windowStart = Math.max(0, idPos - 3000);
            let windowEnd = Math.min(text.length, idPos + 15000);
            let textWindow = text.substring(windowStart, windowEnd);

            let hdUrl = null;
            let sdUrl = null;

            // Search progressive_urls array entries (most reliable, HD quality)
            let progMatches = [...textWindow.matchAll(/"progressive_url"\s*:\s*"((?:[^"\\]|\\.)+)"(?:(?!"progressive_url").)*?"quality"\s*:\s*"(HD|SD)"/g)];
            for (let p of progMatches) {
                let decoded = decodeEscapedStr(p[1]);
                if (p[2] === 'HD') hdUrl = decoded;
                else if (p[2] === 'SD' && !sdUrl) sdUrl = decoded;
            }

            // Fallback: playable_url_quality_hd
            if (!hdUrl) {
                let m = textWindow.match(/"playable_url_quality_hd"\s*:\s*"((?:[^"\\]|\\.)+)"/);
                if (m) hdUrl = decodeEscapedStr(m[1]);
            }

            // Fallback: browser_native_hd_url
            if (!hdUrl) {
                let m = textWindow.match(/"browser_native_hd_url"\s*:\s*"((?:[^"\\]|\\.)+)"/);
                if (m) hdUrl = decodeEscapedStr(m[1]);
            }

            // Fallback: playable_url (SD)
            if (!sdUrl) {
                let m = textWindow.match(/"playable_url"\s*:\s*"((?:[^"\\]|\\.)+)"/);
                if (m) sdUrl = decodeEscapedStr(m[1]);
            }

            let mediaUrl = hdUrl || sdUrl;

            if (mediaUrl && mediaUrl.includes('fbcdn.net')) {
                // Check for DASH manifest
                let dashMatch = textWindow.match(/"dash_manifest"\s*:\s*"((?:[^"\\]|\\.)+)"/);
                if (dashMatch && !mediaUrl) {
                    finalMetadata.dash_manifest = decodeEscapedStr(dashMatch[1]);
                }
                return { mediaUrl, mediaType: "video", finalMetadata };
            }

            // Check for Photo stories
            if (textWindow.includes('"__typename":"Photo"') || textWindow.includes('"__typename\\u0022:\\u0022Photo"')) {
                let imgMatch = textWindow.match(/"image"\s*:\s*\{\s*"uri"\s*:\s*"((?:[^"\\]|\\.)+)"/);
                if (imgMatch) {
                    let imgUrl = decodeEscapedStr(imgMatch[1]);
                    if (imgUrl && imgUrl.includes('fbcdn.net')) {
                        return { mediaUrl: imgUrl, mediaType: "image", finalMetadata };
                    }
                }
            }
        }
        return null;
    }

    /**
     * Attempts to extract story media with retries.
     * Strategy 1: GraphQL JSON cache (populated by fetch/XHR interceptors).
     * Strategy 2: Inline script scanning (covers SSR/hydration on F5).
     */
    function extractStoryWithRetry(currentStoryId, finalMetadata, attempt, maxRetries, retryDelayMs) {
        // Strategy 1: GraphQL JSON cache
        let result = searchCacheForStory(currentStoryId, finalMetadata);

        // Strategy 2: Inline script scanning (only if cache missed)
        if (!result) {
            result = extractFromInlineScripts(currentStoryId, finalMetadata);
        }

        if (result) {
            console.log(`[FB] Media extracted successfully (attempt ${attempt}/${maxRetries}).`);
            window.postMessage({
                action: "FB_STORY_RESULT",
                url: result.mediaUrl,
                type: result.mediaType,
                metadata: result.finalMetadata
            }, "*");
            return;
        }

        if (attempt < maxRetries) {
            console.log(`[FB] No media found (attempt ${attempt}/${maxRetries}). Retrying in ${retryDelayMs}ms...`);
            setTimeout(() => {
                extractStoryWithRetry(currentStoryId, finalMetadata, attempt + 1, maxRetries, retryDelayMs);
            }, retryDelayMs);
            return;
        }

        // All retries exhausted
        console.warn("[FB] All retry attempts exhausted. No direct URL or DASH found.");
        window.postMessage({
            action: "FB_STORY_RESULT",
            url: null,
            type: "video",
            metadata: finalMetadata
        }, "*");
    }

    window.addEventListener("message", (event) => {
        if (event.source !== window || !event.data) return;

        if (event.data.action === "FB_GET_STORY_MEDIA") {
            let finalMetadata = event.data.metadata || {};

            // Extract the current Story ID from the URL (base64-encoded Uzpf... format)
            let currentUrl = decodeURIComponent(window.location.href);
            let urlIdMatch = currentUrl.match(/Uzpf[a-zA-Z0-9_-]+={0,2}/);
            let currentStoryId = urlIdMatch ? urlIdMatch[0] : finalMetadata.shortcode;

            // Start the retry-based extraction (3 attempts, 1.5s apart = max 3s wait)
            extractStoryWithRetry(currentStoryId, finalMetadata, 1, 3, 1500);
        }
    });
})();