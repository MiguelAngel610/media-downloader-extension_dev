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
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
