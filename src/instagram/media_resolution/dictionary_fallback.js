/**
 * @fileoverview Fallback when the fiber search gave nothing: the media dictionary built from the
 * intercepted API responses (window.__md_storyMediaDict, filled by MD_STORY_MEDIA_UPDATE).
 * Classic content script: names are global and must stay unique across src/instagram.
 */

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
