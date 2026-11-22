/**
 * @fileoverview Request/response bridge to the page-world fiber search (Instagram content script).
 * The content script cannot read React internals, so it tags the element with data-md-id and asks
 * interceptors/media/fiber_search.js (MAIN world); ig_interceptor_init.js stores the answer in
 * window.__md_fiberResults[id].
 * Classic content script: names are global and must stay unique across src/instagram.
 */

const RESOLVER_FIBER_POLL_INTERVAL_MS = 50;
const RESOLVER_FIBER_MAX_POLLS = 15; // ~750 ms before falling back to the media dictionary

/**
 * @typedef {Object} FiberLookupRequest
 * @property {string | null} posterSig
 * @property {string | null} shortcode
 * @property {number | null} carouselIndex
 */

/**
 * @param {Element} media
 * @returns {string} unique id now present as data-md-id on the element
 */
function tagMediaElement(media) {
    const id = `md_media_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    media.setAttribute('data-md-id', id);
    return id;
}

/** @param {number} ms */
function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} id - data-md-id of the clicked element
 * @param {FiberLookupRequest} request
 * @returns {Promise<Record<string, any> | undefined>} the stored MD_FIBER_RESULT, or undefined on timeout
 */
async function requestFiberResult(id, request) {
    window.__md_fiberResults = window.__md_fiberResults || {};
    window.postMessage({ type: 'MD_REQUEST_FIBER', id, posterSig: request.posterSig, shortcode: request.shortcode, carouselIndex: request.carouselIndex }, '*');
    for (let poll = 0; poll < RESOLVER_FIBER_MAX_POLLS; poll++) {
        await waitMs(RESOLVER_FIBER_POLL_INTERVAL_MS);
        if (window.__md_fiberResults[id] !== undefined) break;
    }
    const result = window.__md_fiberResults[id];
    delete window.__md_fiberResults[id];
    return result;
}
