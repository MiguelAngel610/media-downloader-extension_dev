/* Media Downloader - Profile Picture Resolver (ISOLATED world)
 * Finds the highest-resolution avatar for a profile, shared by pfp_button.js and auto_backup.js.
 * Order (best source first):
 *   1. Full-HD URL captured from Instagram's own API responses (profile_pic_collector.js → MD_PFP_RESULT)
 *   2. Largest srcset entry
 *   3. Largest same-image URL embedded in the page source
 *   4. "Zoom spoof": temporarily raise devicePixelRatio so React requests a bigger avatar
 * A URL is "low-res" when its size tag is 320px or less; only then the next source is tried. */

const PFP_LOW_RES_MAX_SIDE = 320;
const PFP_ZOOM_POLL_INTERVAL_MS = 100;

/**
 * @param {string} url
 * @returns {number | null} largest side declared in the URL (e.g. s150x150 / p320x320), or null when absent
 */
function getPfpDeclaredSize(url) {
    // Only the resize instruction (stp) and the path carry sizes; base64 params like efg may look like "12x34".
    let haystack = url;
    try {
        const parsed = new URL(url);
        haystack = `${parsed.searchParams.get('stp') || ''} ${parsed.pathname}`;
    } catch (err) {
        // Not an absolute URL (e.g. escaped JSON fragment): scan the raw string instead.
    }
    const match = haystack.match(/[_\-sp](\d{2,4})x(\d{2,4})/);
    return match ? Math.max(parseInt(match[1], 10), parseInt(match[2], 10)) : null;
}

/**
 * @param {string | null | undefined} url
 * @returns {boolean}
 */
function isLowResPfpUrl(url) {
    if (!url) return true;
    const size = getPfpDeclaredSize(url);
    return size !== null && size <= PFP_LOW_RES_MAX_SIDE;
}

/**
 * @param {string} username
 * @returns {string | null}
 */
function getInterceptedHdPfp(username) {
    const results = window.__md_pfpResults;
    if (!username || !results) return null;
    const url = results[username.toLowerCase()];
    return typeof url === 'string' && url ? url : null;
}

/**
 * Picks the entry with the largest descriptor ("320w", "2x"), instead of assuming srcset order.
 * @param {string} srcset
 * @returns {string | null}
 */
function pickLargestFromSrcset(srcset) {
    let bestUrl = null;
    let bestValue = -1;
    for (const match of srcset.matchAll(/(https:\/\/[^\s,]+)(?:\s+(\d+(?:\.\d+)?)[wx])?/g)) {
        const url = match[1];
        const descriptor = match[2] ? parseFloat(match[2]) : 0;
        // When descriptors are missing, fall back to the size tag inside the URL.
        const value = descriptor || getPfpDeclaredSize(url) || 0;
        if (value > bestValue) {
            bestValue = value;
            bestUrl = url;
        }
    }
    return bestUrl;
}

/**
 * Looks for bigger versions of the same avatar file in the server-rendered HTML/JSON.
 * @param {string} src
 * @returns {string | null}
 */
function findLargestInPageSource(src) {
    let fileId = '';
    try {
        const pathParts = new URL(src).pathname.split('/');
        fileId = pathParts[pathParts.length - 1].split('.')[0];
    } catch (err) {
        console.warn('[MD PFP] Could not parse avatar URL:', err);
        return null;
    }
    if (!fileId || !/^[\w-]+$/.test(fileId)) return null;

    const html = document.documentElement.innerHTML;
    const regex = new RegExp(`https:\\/\\/[^\\s"'<]*?${fileId}[^\\s"'<]*?(?:\\.jpg|\\.png)[^\\s"'<]*`, 'g');
    let bestUrl = null;
    let bestSize = -1;
    for (const raw of html.match(regex) || []) {
        const url = raw.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        // A URL without any size tag is the original rendition: it outranks every tagged one.
        const size = getPfpDeclaredSize(url) ?? Number.MAX_SAFE_INTEGER;
        if (size > bestSize) {
            bestSize = size;
            bestUrl = url;
        }
    }
    return bestUrl;
}

/**
 * Raises devicePixelRatio in the MAIN world (device_spoof.js) until React swaps in a bigger avatar.
 * @param {HTMLImageElement} profilePic
 * @param {number} maxChecks - polls of 100ms before giving up
 * @returns {Promise<string | null>}
 */
function requestZoomedPfp(profilePic, maxChecks) {
    return new Promise((resolve) => {
        const originalSrc = profilePic.src || profilePic.currentSrc;
        window.postMessage({ type: 'MD_SPOOF_ZOOM' }, '/');

        let checks = 0;
        const timer = setInterval(() => {
            checks++;
            const currentSrc = profilePic.src || profilePic.currentSrc;
            const srcsetBest = pickLargestFromSrcset(profilePic.getAttribute('srcset') || '');

            let found = null;
            if (currentSrc && currentSrc !== originalSrc && !isLowResPfpUrl(currentSrc)) found = currentSrc;
            else if (srcsetBest && !isLowResPfpUrl(srcsetBest)) found = srcsetBest;

            if (found || checks > maxChecks) {
                clearInterval(timer);
                window.postMessage({ type: 'MD_RESTORE_ZOOM' }, '/');
                resolve(found);
            }
        }, PFP_ZOOM_POLL_INTERVAL_MS);
    });
}

/**
 * @typedef {Object} PfpResolution
 * @property {string} url
 * @property {'network' | 'srcset' | 'page-source' | 'zoom' | 'displayed'} source
 * @property {boolean} isLowRes - true when only a ≤320px version could be found
 */

/**
 * @param {HTMLImageElement} profilePic
 * @param {string} username
 * @param {{ zoomMaxChecks?: number }} [options]
 * @returns {Promise<PfpResolution | null>}
 */
async function resolveBestPfpUrl(profilePic, username, options = {}) {
    const zoomMaxChecks = options.zoomMaxChecks ?? 30;

    const intercepted = getInterceptedHdPfp(username);
    if (intercepted) return { url: intercepted, source: 'network', isLowRes: isLowResPfpUrl(intercepted) };

    const displayed = profilePic.src || profilePic.currentSrc;
    if (!displayed) return null;

    /** @type {PfpResolution} */
    let best = { url: displayed, source: 'displayed', isLowRes: isLowResPfpUrl(displayed) };

    const srcsetBest = pickLargestFromSrcset(profilePic.getAttribute('srcset') || '');
    if (srcsetBest && !isLowResPfpUrl(srcsetBest)) return { url: srcsetBest, source: 'srcset', isLowRes: false };

    if (best.isLowRes) {
        const fromSource = findLargestInPageSource(displayed);
        if (fromSource && !isLowResPfpUrl(fromSource)) return { url: fromSource, source: 'page-source', isLowRes: false };
    }

    if (best.isLowRes) {
        const zoomed = await requestZoomedPfp(profilePic, zoomMaxChecks);
        if (zoomed) return { url: zoomed, source: 'zoom', isLowRes: false };
        // The zoom may also have let the network collector catch the HD URL.
        const lateIntercepted = getInterceptedHdPfp(username);
        if (lateIntercepted) return { url: lateIntercepted, source: 'network', isLowRes: isLowResPfpUrl(lateIntercepted) };
    }

    return best;
}

window.MDPfpResolver = Object.freeze({ resolveBestPfpUrl, isLowResPfpUrl });
