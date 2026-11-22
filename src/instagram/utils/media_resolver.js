/**
 * @fileoverview Resolves the best media URL and metadata for a clicked feed/modal element
 * (Instagram content script). Steps: thumbnail signature (media_resolution/poster_signature.js)
 * -> expected shortcode (media_resolution/shortcode_locator.js) -> page-world fiber search
 * (media_resolution/fiber_bridge.js) -> media dictionary fallback (media_resolution/dictionary_fallback.js).
 * Classic content script: names are global and must stay unique across src/instagram.
 */

/**
 * @param {Record<string, any>} result - stored MD_FIBER_RESULT with a URL or a DASH manifest
 * @param {string | null} expectedShortcode
 * @returns {ResolvedMedia}
 */
function metadataFromFiberResult(result, expectedShortcode) {
    const bestUrl = result.url || null;
    const bestMetadata = {
        dash_manifest: result.dash_manifest || null,
        shortcode: result.shortcode || expectedShortcode || null,
        username: result.user || null,
        timestamp: result.time || null, // bridge field is 'time' (see ig_interceptor_init.js)
        media_id: result.media_id || null,
    };
    if (result.index) bestMetadata.index = result.index;
    // From the result, not the DOM element: the element may be the IMG thumbnail of a lazy-loaded video.
    bestMetadata.is_video = Boolean(result.dash_manifest || (bestUrl && bestUrl.includes('.mp4')));
    if (bestUrl) bestMetadata.url = bestUrl;
    return { bestUrl, bestMetadata };
}

/**
 * @param {HTMLElement | null} media - clicked <img>/<video>
 * @param {Element | null} article - post container used to find the expected shortcode
 * @param {string | null} [knownShortcode]
 * @param {number | null} [carouselIndex] - 1-based slide index when the caller knows it
 * @returns {Promise<ResolvedMedia>}
 */
async function resolveMediaUrl(media, article, knownShortcode = null, carouselIndex = null) {
    if (!media) return { bestUrl: null, bestMetadata: {} };
    const id = tagMediaElement(media);
    const posterSig = posterSignatureOf(media);
    const expectedShortcode = knownShortcode || (findCenteredShortcode(article) ?? knownShortcode);

    const result = await requestFiberResult(id, { posterSig, shortcode: expectedShortcode, carouselIndex });
    if (result && (result.url || result.dash_manifest)) return metadataFromFiberResult(result, expectedShortcode);
    return findInMediaDictionary(media, expectedShortcode);
}
