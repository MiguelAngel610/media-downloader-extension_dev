/**
 * @fileoverview Shortcode of the post the user is looking at (Instagram content script).
 * A post container can hold several /p/ and /reel/ links (pinned or neighbouring posts in feeds and
 * modals); the one closest to the viewport centre belongs to the post on screen.
 * Classic content script: names are global and must stay unique across src/instagram.
 */

const RESOLVER_POST_LINK_SELECTOR = 'a[href*="/p/"], a[href*="/reel/"]';
const RESOLVER_SHORTCODE_IN_LINK = /\/(?:p|reel)\/([^/?#]+)/;

/**
 * @param {Element} element
 * @returns {number} distance in px from the element centre to the viewport centre
 */
function distanceToViewportCenter(element) {
    const rect = element.getBoundingClientRect();
    return Math.hypot(rect.left + rect.width / 2 - window.innerWidth / 2, rect.top + rect.height / 2 - window.innerHeight / 2);
}

/**
 * @param {Element | null} article
 * @returns {string | null}
 */
function findCenteredShortcode(article) {
    if (!article) return null;
    const ranked = Array.from(article.querySelectorAll(RESOLVER_POST_LINK_SELECTOR))
        .map((link) => ({ link, distance: distanceToViewportCenter(link) }))
        .sort((a, b) => a.distance - b.distance); // stable: equal distances keep document order
    if (ranked.length === 0) return null;
    const match = ranked[0].link.href.match(RESOLVER_SHORTCODE_IN_LINK);
    return match ? match[1] : null;
}
