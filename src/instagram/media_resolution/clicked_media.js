/**
 * @fileoverview What the user clicked (Instagram content script). Two identifiers let the page-world
 * fiber search pick the exact post and carousel slide:
 *  - thumbnail signature: the CDN filename without extension (e.g. "467003456_123_456_n"), shared by
 *    every size of the same image;
 *  - shortcode: a post container can hold several /p/ and /reel/ links (pinned or neighbouring posts);
 *    the one closest to the viewport centre belongs to the post on screen.
 */

const RESOLVER_FILENAME_FALLBACK = /\/([^/]+)\.(?:jpg|webp|mp4)/;

/**
 * @param {string | null | undefined} url
 * @returns {string | null} filename without extension (ignores .jpg vs .webp differences)
 */
export function extractSignature(url) {
    if (!url) return null;
    try {
        const parts = new URL(url).pathname.split('/');
        return parts[parts.length - 1].replace(/\.[a-zA-Z0-9]+$/, '');
    } catch {
        // Relative or escaped URL: fall back to a plain filename match.
        const match = url.match(RESOLVER_FILENAME_FALLBACK);
        return match ? match[1] : null;
    }
}

/**
 * Nearest <img> that represents a video (Instagram renders the thumbnail next to it).
 * @param {HTMLElement} media
 * @returns {HTMLImageElement | null}
 */
function siblingThumbnailOf(media) {
    const parent = media.parentElement;
    let thumbnail = parent ? parent.querySelector('img') : null;
    if (!thumbnail && parent && parent.parentElement) thumbnail = parent.parentElement.querySelector('img');
    if (!thumbnail) {
        const slide = media.closest('li');
        if (slide) thumbnail = slide.querySelector('img');
    }
    return thumbnail;
}

/**
 * Priority for videos: poster attribute > non-blob src (a blob: URL carries no CDN filename) > sibling thumbnail.
 * @param {HTMLElement} media - <img> or <video>
 * @returns {string | null}
 */
export function posterSignatureOf(media) {
    if (media.tagName === 'IMG') return extractSignature(media.src);
    if (media.tagName !== 'VIDEO') return null;
    let signature = media.poster ? extractSignature(media.poster) : null;
    if (!signature && media.src && !media.src.startsWith('blob:')) signature = extractSignature(media.src);
    if (signature) return signature;
    const thumbnail = siblingThumbnailOf(media);
    return thumbnail ? extractSignature(thumbnail.src) : null;
}

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
export function findCenteredShortcode(article) {
    if (!article) return null;
    const ranked = Array.from(article.querySelectorAll(RESOLVER_POST_LINK_SELECTOR))
        .map((link) => ({ link, distance: distanceToViewportCenter(link) }))
        .sort((a, b) => a.distance - b.distance); // stable: equal distances keep document order
    if (ranked.length === 0) return null;
    const match = ranked[0].link.href.match(RESOLVER_SHORTCODE_IN_LINK);
    return match ? match[1] : null;
}
