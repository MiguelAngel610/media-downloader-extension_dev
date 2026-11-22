/**
 * @fileoverview Where the media URL and metadata come from (Instagram content script), best first:
 *  1. the page-world fiber search: the content script cannot read React internals, so it tags the
 *     element with data-md-id and asks interceptors/media/fiber_search.js (MAIN world);
 *     ig_interceptor_init.js stores the answer in window.__md_fiberResults[id];
 *  2. the media dictionary built from the intercepted API responses (window.__md_storyMediaDict).
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

const RESOLVER_IMG_INDEX_PARAM = /img_index=(\d+)/;

/**
 * @typedef {Object} ResolvedMedia
 * @property {string | null} bestUrl
 * @property {Record<string, any>} bestMetadata
 */

/**
 * 0-based carousel position: ?img_index= in modals, otherwise the slide's <li> position.
 * Note: feed carousels are virtualized, so the <li> position can be off; the fiber search is the reliable source.
 * @param {Element} media
 * @returns {number} -1 when unknown
 */
function carouselPositionOf(media) {
    const fromUrl = window.location.search.match(RESOLVER_IMG_INDEX_PARAM);
    if (fromUrl) return parseInt(fromUrl[1], 10) - 1;
    const list = media.closest('ul');
    const slide = media.closest('li');
    if (!list || !slide) return -1;
    return Array.from(list.querySelectorAll('li')).indexOf(slide);
}

/**
 * @param {Element} media
 * @param {Array<Record<string, any>>} items - dictionary entries of one post
 * @returns {Record<string, any>}
 */
function pickCarouselItem(media, items) {
    if (items.length <= 1) return items[0];
    const position = carouselPositionOf(media);
    return position >= 0 && position < items.length ? items[position] : items[0];
}

/**
 * @param {Element} media
 * @param {string | null} expectedShortcode
 * @returns {ResolvedMedia}
 */
function findInMediaDictionary(media, expectedShortcode) {
    const bestMetadata = {};
    if (!window.__md_storyMediaDict) return { bestUrl: null, bestMetadata };
    let items = Object.values(window.__md_storyMediaDict);
    if (expectedShortcode) items = items.filter((item) => item.shortcode === expectedShortcode || item.code === expectedShortcode);
    if (items.length === 0) return { bestUrl: null, bestMetadata };

    const target = pickCarouselItem(media, items);
    bestMetadata.shortcode = target.shortcode || target.code || expectedShortcode || null;
    if (target.username) bestMetadata.username = target.username;
    if (target.timestamp) bestMetadata.timestamp = target.timestamp;
    const bestUrl = target.url || null;
    if (target.dash_manifest) {
        bestMetadata.dash_manifest = target.dash_manifest;
        bestMetadata.is_video = true;
    } else if (bestUrl && bestUrl.includes('.mp4')) {
        bestMetadata.is_video = true;
    }
    if (bestUrl) bestMetadata.url = bestUrl;
    return { bestUrl, bestMetadata };
}
