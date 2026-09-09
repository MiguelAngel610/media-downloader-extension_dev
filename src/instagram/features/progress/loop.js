import { syncOverlays } from './feed.js';

let mdLastUrl = window.location.href;
let mdSuspendUntil = 0;

export function startSyncLoop() {
    if (window.__md_overlaySyncLoopStarted) return;
    window.__md_overlaySyncLoopStarted = true;

    function frame() {
        if (!document.body || Date.now() < mdSuspendUntil) {
            requestAnimationFrame(frame);
            return;
        }
        syncOverlays();
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
