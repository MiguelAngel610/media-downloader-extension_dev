/* Media Downloader - Device Spoof (MAIN world): temporary devicePixelRatio zoom used by pfp_resolver.js */

window.addEventListener('message', function(event) {
    // Only our own window may trigger the zoom spoof (rejects openers/iframes; also avoids a TypeError on null data).
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'MD_SPOOF_ZOOM') {
        try {
            window.__md_originalRatio = window.devicePixelRatio;
            Object.defineProperty(window, 'devicePixelRatio', {
                get: function() { return 5; },
                configurable: true
            });
            window.dispatchEvent(new Event('resize'));
        } catch(e) {}
    }

    if (event.data.type === 'MD_RESTORE_ZOOM') {
        try {
            if (window.__md_originalRatio) {
                Object.defineProperty(window, 'devicePixelRatio', {
                    get: function() { return window.__md_originalRatio; },
                    configurable: true
                });
            }
            window.dispatchEvent(new Event('resize'));
        } catch(e) {}
    }


    
});
