/**
 * @fileoverview Fiber search state (MAIN world).
 * Everything the three search phases accumulate for one MD_REQUEST_FIBER, in one place.
 * The first value found for each field wins; carousel slides may still claim the index. */

/**
 * @typedef {Object} FiberSearchState
 * @property {string} url
 * @property {string} dash
 * @property {string} id
 * @property {string} code
 * @property {string} user
 * @property {number | null} time
 * @property {number | null} index - 1-based carousel slide
 * @property {string | null | undefined} expectedShortcode - guard against neighbouring posts
 * @property {string | null | undefined} posterSig - thumbnail filename of the clicked element
 * @property {number | null | undefined} carouselIndex - slide index requested by the content script
 */

/**
 * @param {{ shortcode?: string, posterSig?: string, carouselIndex?: number }} request
 * @returns {FiberSearchState}
 */
export function createSearchState(request) {
    return {
        url: '', dash: '', id: '', code: '', user: '', time: null, index: null,
        expectedShortcode: request.shortcode,
        posterSig: request.posterSig,
        carouselIndex: request.carouselIndex,
    };
}

/** Video found with full identity: nothing else to look for. */
export function hasDashWithIdentity(state) {
    return Boolean(state.dash && state.user && state.time);
}

/** Any media (DASH or URL) found with full identity. */
export function hasMediaWithIdentity(state) {
    return Boolean((state.dash || state.url) && state.user && state.time);
}

/** Owner and date known (enough to name the file). */
export function hasIdentity(state) {
    return Boolean(state.user && state.time);
}

/**
 * A carousel slide may still provide its index even after a URL/manifest was found elsewhere.
 * @param {string} currentValue
 * @param {FiberSearchState} state
 * @param {number} slideIndex - 0-based slide position, -1 outside carousels
 */
function canTake(currentValue, state, slideIndex) {
    return !currentValue || (slideIndex >= 0 && !state.index);
}

/**
 * @param {FiberSearchState} state
 * @param {'url' | 'dash'} field
 * @param {string | null} value
 * @param {number} slideIndex
 */
export function takeMedia(state, field, value, slideIndex) {
    if (!value || !canTake(state[field], state, slideIndex)) return;
    if (!state[field]) state[field] = value;
    if (slideIndex >= 0) state.index = slideIndex + 1;
}

/**
 * @param {FiberSearchState} state
 * @param {string} requestId
 * @returns {Record<string, unknown>} the MD_FIBER_RESULT message
 */
export function toResultMessage(state, requestId) {
    if (state.url || state.dash) {
        return { type: 'MD_FIBER_RESULT', id: requestId, url: state.url, dash: state.dash, media_id: state.id,
            shortcode: state.code, index: state.index, user: state.user || null, time: state.time || null };
    }
    return { type: 'MD_FIBER_RESULT', id: requestId, error: true, media_id: state.id, shortcode: state.code };
}
