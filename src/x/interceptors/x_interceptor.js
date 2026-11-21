(function() {
    console.log("X/Twitter API Interceptor Loaded");
    
    window.__X_VIDEO_CACHE__ = window.__X_VIDEO_CACHE__ || {};
    
    // Helper to extract videos from tweet objects recursively
    function extractVideos(obj) {
        if (!obj || typeof obj !== 'object') return;
        
        // Check if this object is a tweet result
        if (obj.legacy && obj.legacy.extended_entities && obj.legacy.extended_entities.media) {
            let tweetId = obj.rest_id;
            if (tweetId) {
                let mediaArray = obj.legacy.extended_entities.media;
                for (let media of mediaArray) {
                    if (media.type === 'video' || media.type === 'animated_gif') {
                        let variants = media.video_info && media.video_info.variants;
                        if (variants) {
                            // Find highest bitrate mp4
                            let mp4s = variants.filter(v => v.content_type === 'video/mp4');
                            if (mp4s.length > 0) {
                                mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                                let bestMp4 = mp4s[0].url;
                                window.__X_VIDEO_CACHE__[tweetId] = bestMp4;
                                console.log("Intercepted video for Tweet:", tweetId, bestMp4);
                            } else {
                                // Fallback to first variant
                                window.__X_VIDEO_CACHE__[tweetId] = variants[0].url;
                            }
                        }
                    }
                }
            }
        }
        
        // Recursive search for nested tweets
        for (let key in obj) {
            extractVideos(obj[key]);
        }
    }

    // Intercept fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) ? args[0].url : '';
            if (url.includes('/graphql/') || url.includes('/api/')) {
                const clone = response.clone();
                clone.json().then(data => {
                    extractVideos(data);
                }).catch((err) => { if (!(err instanceof SyntaxError)) console.warn('[X-MD] Could not parse intercepted response:', err); /* non-JSON bodies are expected */ });
            }
        } catch (e) {
            console.error("Fetch intercept error", e);
        }
        return response;
    };

    // Intercept XHR
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.addEventListener('load', function() {
            try {
                if (typeof url === 'string' && (url.includes('/graphql/') || url.includes('/api/'))) {
                    const responseText = this.responseText;
                    if (responseText && responseText.startsWith('{')) {
                        const data = JSON.parse(responseText);
                        extractVideos(data);
                    }
                }
            } catch (err) { if (!(err instanceof SyntaxError)) console.warn('[X-MD] XHR response handling failed:', err); }
        });
        originalOpen.call(this, method, url, ...rest);
    };
    
    // Listen for requests from content script
    window.addEventListener("message", (event) => {
        if (event.source !== window || !event.data || event.data.action !== "GET_X_VIDEO") return;
        
        const tweetId = event.data.tweetId;
        const tweetDate = event.data.tweetDate;
        const videoUrl = window.__X_VIDEO_CACHE__[tweetId];
        
        window.postMessage({
            action: "X_VIDEO_RESULT",
            tweetId: tweetId,
            tweetDate: tweetDate,
            videoUrl: videoUrl
        }, "*");
    });
})();
