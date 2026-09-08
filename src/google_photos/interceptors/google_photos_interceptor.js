(function() {
    function extractTimestampsAndNotify(text) {
        // Look for 13-digit Unix timestamps (starting with 1)
        const regex = /\b(1[0-9]{12})\b/g;
        let timestamps = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            timestamps.push(parseInt(match[1], 10));
        }
        if (timestamps.length > 0) {
            // Deduplicate to avoid sending massive arrays
            const uniqueTimestamps = [...new Set(timestamps)];
            window.postMessage({
                type: 'MD_GP_NETWORK_TIMESTAMPS',
                timestamps: uniqueTimestamps
            }, '*');
        }
    }

    // 1. Intercept XMLHttpRequest
    const originalOpen = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
    };

    window.XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            if (this._url && typeof this._url === 'string' && this._url.includes('batchexecute')) {
                extractTimestampsAndNotify(this.responseText);
            }
        });
        return originalSend.apply(this, arguments);
    };

    // 2. Intercept Fetch API
    const originalFetch = window.fetch;
    window.fetch = async function() {
        const response = await originalFetch.apply(this, arguments);
        const url = arguments[0] instanceof Request ? arguments[0].url : arguments[0];
        
        if (url && typeof url === 'string' && url.includes('batchexecute')) {
            try {
                const clone = response.clone();
                clone.text().then(text => {
                    extractTimestampsAndNotify(text);
                }).catch(e => {});
            } catch(e) {
                // Ignore clone errors
            }
        }
        return response;
    };
})();
