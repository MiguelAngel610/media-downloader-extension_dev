/* Media Downloader - Overlay Root: Creates and exposes the floating overlay container */

function getOverlayRoot() {
    let overlayRoot = document.getElementById('md-overlay-root');
    if (!overlayRoot) {
        overlayRoot = document.createElement('div');
        overlayRoot.id = 'md-overlay-root';
        overlayRoot.style.position = 'absolute';
        overlayRoot.style.top = '0';
        overlayRoot.style.left = '0';
        overlayRoot.style.width = '0';
        overlayRoot.style.height = '0';
        overlayRoot.style.overflow = 'visible';
        overlayRoot.style.pointerEvents = 'none';
        overlayRoot.style.zIndex = '2147483647';
        // Attach to <html> element, NOT <body>.
        // Instagram's React manages document.body via React Portals.
        // Any foreign node inside body causes React reconciliation crashes (black screen).
        // The <html> element is never touched by React, making it completely safe.

        document.documentElement.appendChild(overlayRoot);
    }
    return overlayRoot;
}
