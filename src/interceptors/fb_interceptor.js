(function() {
    console.log("FB Interceptor Loaded");

    window.__FB_STORY_CACHE__ = {};
    window.__fb_ghostSeen = false;
    window.__fb_ghostPresence = false;

    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) return;
        if (event.data.type === 'FB_GHOST_SEEN_TOGGLE') {
            window.__fb_ghostSeen = event.data.enabled;
            console.log("[FB-MD] Ghost Seen:", window.__fb_ghostSeen);
        }
        if (event.data.type === 'FB_GHOST_PRESENCE_TOGGLE') {
            window.__fb_ghostPresence = event.data.enabled;
            console.log("[FB-MD] Ghost Presence:", window.__fb_ghostPresence);
        }
    });

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

    // Intercept fetch to capture video URLs from Facebook's API
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        let url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        let body = args[1]?.body || '';
        let bodyStr = typeof body === 'string' ? body : '';
        
        if (isFBSeenRequest(url, bodyStr)) {
            console.warn("👻 [FB Ghost] Blocked seen receipt via fetch:", url);
            return new Response(JSON.stringify({ data: { success: true } }), { status: 200, statusText: 'OK' });
        }
        if (isFBPresenceRequest(url, bodyStr)) {
            console.warn("🛡️ [FB Ghost] Blocked presence update via fetch:", url);
            return new Response(JSON.stringify({ data: { success: true } }), { status: 200, statusText: 'OK' });
        }

        const response = await originalFetch.apply(this, args);
        try {
            // Catch GraphQL responses to extract timestamps (used when switching stories in SPA)
            const contentType = response.headers.get('Content-Type') || '';
            if (url.includes('graphql') || contentType.includes('application/json') || contentType.includes('text/javascript')) {
                response.clone().text().then(text => {

                    // Extract timestamps
                    let timeMatch = text.match(/"(?:creation_time|publish_time)"\s*:\s*(\d+)/);
                    if (timeMatch) {
                        window.__FB_STORY_CACHE__['LATEST_TIMESTAMP'] = parseInt(timeMatch[1], 10);
                    }
                    // Try to map to specific IDs
                    let idTimeRegex = /"(?:id|fbid|post_id)"\s*:\s*"(\d+)"[\s\S]{0,500}?"(?:creation_time|publish_time)"\s*:\s*(\d+)/g;
                    for (let m of [...text.matchAll(idTimeRegex)]) {
                        window.__FB_STORY_CACHE__[`TS_${m[1]}`] = parseInt(m[2], 10);
                    }
                    let timeIdRegex = /"(?:creation_time|publish_time)"\s*:\s*(\d+)[\s\S]{0,500}?"(?:id|fbid|post_id)"\s*:\s*"(\d+)"/g;
                    for (let m of [...text.matchAll(timeIdRegex)]) {
                        window.__FB_STORY_CACHE__[`TS_${m[2]}`] = parseInt(m[1], 10);
                    }
                }).catch(e => {});
            }
        } catch (e) {}
        return response;
    };

    // Also intercept XHR
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._md_url = url;
        if (typeof url === 'string' && (url.includes('video') || url.includes('fbcdn') || url.includes('graphql'))) {
            this.addEventListener('load', function() {
                try {
                    // Catch GraphQL via XHR to extract timestamps
                    if (this.responseURL && this.responseURL.includes('graphql') && this.responseText) {
                        let text = this.responseText;

                        // Extract timestamps
                        let timeMatch = text.match(/"(?:creation_time|publish_time)"\s*:\s*(\d+)/);
                        if (timeMatch) {
                            window.__FB_STORY_CACHE__['LATEST_TIMESTAMP'] = parseInt(timeMatch[1], 10);
                        }
                        let idTimeRegex = /"(?:id|fbid|post_id)"\s*:\s*"(\d+)"[\s\S]{0,500}?"(?:creation_time|publish_time)"\s*:\s*(\d+)/g;
                        for (let m of [...text.matchAll(idTimeRegex)]) {
                            window.__FB_STORY_CACHE__[`TS_${m[1]}`] = parseInt(m[2], 10);
                        }
                        let timeIdRegex = /"(?:creation_time|publish_time)"\s*:\s*(\d+)[\s\S]{0,500}?"(?:id|fbid|post_id)"\s*:\s*"(\d+)"/g;
                        for (let m of [...text.matchAll(timeIdRegex)]) {
                            window.__FB_STORY_CACHE__[`TS_${m[2]}`] = parseInt(m[1], 10);
                        }
                    }
                } catch (e) {}
            });
        }
        return origOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(body) {
        let url = this._md_url || '';
        let bodyStr = typeof body === 'string' ? body : '';
        
        if (isFBSeenRequest(url, bodyStr)) {
            console.warn("👻 [FB Ghost] Blocked seen receipt via XHR:", url);
            Object.defineProperty(this, 'status', { get: () => 200 });
            Object.defineProperty(this, 'readyState', { get: () => 4 });
            Object.defineProperty(this, 'responseText', { get: () => '{"data": {"success": true}}' });
            setTimeout(() => this.dispatchEvent(new Event('load')), 10);
            return;
        }
        if (isFBPresenceRequest(url, bodyStr)) {
            console.warn("🛡️ [FB Ghost] Blocked presence update via XHR:", url);
            Object.defineProperty(this, 'status', { get: () => 200 });
            Object.defineProperty(this, 'readyState', { get: () => 4 });
            Object.defineProperty(this, 'responseText', { get: () => '{"data": {"success": true}}' });
            setTimeout(() => this.dispatchEvent(new Event('load')), 10);
            return;
        }
        
        return origSend.call(this, body);
    };



    // Listen for download requests from content script
    window.addEventListener("message", (event) => {
        if (event.source !== window || !event.data) return;

        if (event.data.action === "FB_GET_STORY_VIDEO") {
            let videoUrl = null;

            // Fallback: search HTML specifically for this Reel/Story ID
            let finalMetadata = event.data.metadata || {};
            
            if (!finalMetadata.shortcode || finalMetadata.shortcode === "story") {
                // Find the most likely story video (playing or largest) ONLY for Stories
                const videos = Array.from(document.querySelectorAll('video')).filter(v => v.offsetWidth > 100);
                let targetVideo = videos.find(v => !v.paused) || videos[videos.length - 1];

                if (targetVideo) {
                    const sources = targetVideo.querySelectorAll("source");
                    if (sources.length > 0) {
                        const sorted = Array.from(sources).sort((a, b) => {
                            return (parseInt(b.getAttribute("size") || "0") || 0) - (parseInt(a.getAttribute("size") || "0") || 0);
                        });
                        videoUrl = sorted[0].src;
                    }
                    if (!videoUrl) videoUrl = targetVideo.currentSrc || targetVideo.src;
                }
            }
            if (finalMetadata.shortcode && finalMetadata.shortcode !== "story") {
                console.log("[FB] Buscando Reel en HTML scripts para ID:", finalMetadata.shortcode);
                let scripts = document.querySelectorAll('script[type="application/json"], script[data-sjs]');
                for (let script of scripts) {
                    let text = script.textContent;
                    if (text && text.includes(finalMetadata.shortcode)) {
                        // Extract URL
                        if (text.includes('playable_url_quality_hd') || text.includes('playable_url')) {
                            // Buscar muy cerca del ID del Reel (hacia adelante o atrás)
                            let regexFwd = new RegExp(`"${finalMetadata.shortcode}"[\\s\\S]{0,1500}?"playable_url(?:_quality_hd)?"\\s*:\\s*"(https:\\/\\/[^"]*?fbcdn[^"]*?)"`);
                            let regexBwd = new RegExp(`"playable_url(?:_quality_hd)?"\\s*:\\s*"(https:\\/\\/[^"]*?fbcdn[^"]*?)"[\\s\\S]{0,1500}?"(?:id|fbid|post_id)"\\s*:\\s*"${finalMetadata.shortcode}"`);
                            
                            let m = text.match(regexFwd) || text.match(regexBwd);
                            if (m) {
                                try { videoUrl = JSON.parse('"' + m[1] + '"'); } catch(e) { videoUrl = m[1].replace(/\\/g, ''); }
                                console.log("[FB] Extracted Reel URL from scripts (Overwriting targetVideo)!");
                            }
                        }
                        
                        // Extract Timestamp
                        let tsFwd = new RegExp(`"${finalMetadata.shortcode}"[\\s\\S]{0,1500}?"(?:creation_time|publish_time)"\\s*:\\s*(\\d+)`);
                        let tsBwd = new RegExp(`"(?:creation_time|publish_time)"\\s*:\\s*(\\d+)[\\s\\S]{0,1500}?"(?:id|fbid|post_id)"\\s*:\\s*"${finalMetadata.shortcode}"`);
                        let mTs = text.match(tsFwd) || text.match(tsBwd);
                        if (mTs) {
                            window.__FB_STORY_CACHE__[`TS_${finalMetadata.shortcode}`] = parseInt(mTs[1], 10);
                            console.log("[FB] Extracted creation_time from scripts:", mTs[1]);
                        }
                    }
                }
            }

            // Ultimate Fallback: if we still don't have a URL, force a blob to trigger the Python yt-dlp fallback
            if (!videoUrl) {
                videoUrl = "blob:fallback";
            }

            if (finalMetadata.shortcode && window.__FB_STORY_CACHE__[`TS_${finalMetadata.shortcode}`]) {
                finalMetadata.timestamp = window.__FB_STORY_CACHE__[`TS_${finalMetadata.shortcode}`];
            } else if (window.__FB_STORY_CACHE__['LATEST_TIMESTAMP']) {
                if (!finalMetadata.timestamp || finalMetadata.timestamp > (Date.now()/1000) - 86400) {
                    finalMetadata.timestamp = window.__FB_STORY_CACHE__['LATEST_TIMESTAMP'];
                }
            }

            window.postMessage({
                action: "FB_STORY_RESULT",
                url: videoUrl,
                type: "video",
                metadata: finalMetadata
            }, "*");
        }

        if (event.data.action === "FB_GET_STORY_IMAGE") {
            let imgUrl = null;

            // Find all large images on screen (likely stories)
            const imgs = Array.from(document.querySelectorAll("img")).filter(img => img.naturalWidth > 200 && img.naturalHeight > 300);
            let bestArea = 0;
            
            for (const img of imgs) {
                const area = img.naturalWidth * img.naturalHeight;
                if (area > bestArea) {
                    bestArea = area;
                    imgUrl = img.src;
                }
            }

            let finalMetadata = event.data.metadata || {};
            if (finalMetadata.shortcode && window.__FB_STORY_CACHE__[`TS_${finalMetadata.shortcode}`]) {
                finalMetadata.timestamp = window.__FB_STORY_CACHE__[`TS_${finalMetadata.shortcode}`];
            } else if (window.__FB_STORY_CACHE__['LATEST_TIMESTAMP']) {
                if (!finalMetadata.timestamp || finalMetadata.timestamp > (Date.now()/1000) - 86400) {
                    finalMetadata.timestamp = window.__FB_STORY_CACHE__['LATEST_TIMESTAMP'];
                }
            }

            window.postMessage({
                action: "FB_STORY_RESULT",
                url: imgUrl,
                type: "image",
                metadata: finalMetadata
            }, "*");
        }
    });
})();
