import { syncOverlays } from './feed.js';

export function startSyncLoop() {
    if (window.__md_overlaySyncLoopStarted) return;
    window.__md_overlaySyncLoopStarted = true;

    function frame() {
        if (!document.body) {
            requestAnimationFrame(frame);
            return;
        }
        syncOverlays();
        if (typeof injectStoryButton === 'function') injectStoryButton();
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
