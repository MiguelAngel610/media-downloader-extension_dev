import { syncOverlays } from './feed.js';

let mdLastUrl = window.location.href;
let mdSuspendUntil = 0;

export function startSyncLoop() {
    if (window.__md_overlaySyncLoopStarted) return;
    window.__md_overlaySyncLoopStarted = true;

    syncOverlays();
}
