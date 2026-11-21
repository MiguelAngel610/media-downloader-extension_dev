// vanish.js - Injected into the MAIN world to intercept network requests

if (window.location.search.includes('__md_extract_hd=1')) {
    try {
        Object.defineProperty(window, 'devicePixelRatio', { get: () => 3 });
        Object.defineProperty(window.screen, 'width', { get: () => 1920 });
        Object.defineProperty(window.screen, 'height', { get: () => 1080 });
        Object.defineProperty(window, 'innerWidth', { get: () => 1920 });
        Object.defineProperty(window, 'innerHeight', { get: () => 1080 });
        
        let origMatchMedia = window.matchMedia;
        window.matchMedia = function(query) {
            if (query.includes('resolution') || query.includes('min-width') || query.includes('min-device-pixel-ratio')) {
                return {
                    matches: true, media: query, onchange: null,
                    addListener: () => {}, removeListener: () => {},
                    addEventListener: () => {}, removeEventListener: () => {},
                    dispatchEvent: () => true
                };
            }
            return origMatchMedia.apply(this, arguments);
        };
        console.log("MD: Native spoofing applied via vanish.js!");
    } catch(e) {}
}


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
