/**
 * @fileoverview Story viewer basics (Instagram content script): the story id in the URL and the
 * geometry/visibility rules of the viewer.
 * The story is a centred column; elements outside it belong to the neighbouring stories carousel.
 * Classic content script: names are global and must stay unique across src/instagram.
 */

const STORY_ID_IN_URL = /\/stories\/[^/]+\/(\d+)/;
const STORY_COLUMN_HALF_WIDTH_PX = 360;
const STORY_EXTENSION_UI_SELECTOR = '#md-reel-warning-toast, [id^="md-"], [class*="md-"]';

/**
 * @typedef {Object} VerticalBounds
 * @property {number} topMin - minimum rect.top in px
 * @property {number} bottomMargin - rect.bottom must be <= innerHeight + bottomMargin
 */

/** Whole viewport plus a 100 px tolerance (badges are often partly off screen). */
const STORY_FULL_HEIGHT = { topMin: -100, bottomMargin: 100 };
/** Story body only: below the author header and above the reply input. */
const STORY_BODY_HEIGHT = { topMin: 120, bottomMargin: -60 };

/** @param {Element} element */
function isExtensionUi(element) {
    return Boolean(element.closest(STORY_EXTENSION_UI_SELECTOR));
}

/** @param {Element} element */
function isRenderedVisible(element) {
    const style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.opacity !== '0' && style.display !== 'none';
}

/**
 * @param {Element} element
 * @param {VerticalBounds} bounds
 * @returns {boolean} true when the element sits inside the centred story column
 */
function isInStoryColumn(element, bounds) {
    const rect = element.getBoundingClientRect();
    // Zero-width elements (collapsed inline links) have no meaningful centre: use their left edge.
    const x = rect.width > 0 ? rect.left + rect.width / 2 : rect.left;
    return Math.abs(x - window.innerWidth / 2) < STORY_COLUMN_HALF_WIDTH_PX
        && rect.top >= bounds.topMin
        && rect.bottom <= window.innerHeight + bounds.bottomMargin;
}

/**
 * @param {Element} element
 * @returns {string | null} href of the enclosing or first nested link
 */
function nearestLinkHref(element) {
    const link = element.closest('a[href]') || element.querySelector('a[href]');
    return link ? link.href : null;
}

/** @returns {string | null} media id of the story slide in the URL (/stories/<user>/<id>/) */
function currentStoryId() {
    const match = window.location.href.match(STORY_ID_IN_URL);
    return match ? match[1] : null;
}
