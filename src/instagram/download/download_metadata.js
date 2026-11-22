/**
 * @fileoverview Completes download metadata before it is sent to the host (Instagram content script).
 * The resolvers (feed, story, fiber) may leave gaps; this fills owner, shortcode, date and media id
 * from the DOM and the address bar, in a fixed priority order.
 * Classic content script: names are global and must stay unique across src/instagram.
 */

const DOWNLOAD_SHORTCODE_IN_PATH = /\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)/;
const DOWNLOAD_STORY_ID_IN_PATH = /\/stories\/[^/]+\/(\d+)/;
const DOWNLOAD_NUMERIC_MEDIA_ID = /^\d+(_\d+)?$/;
const DOWNLOAD_MAX_SHORTCODE_LENGTH = 15;
const DOWNLOAD_FALLBACK_TIMESTAMP_WINDOW_SECONDS = 60;
const DOWNLOAD_POST_CONTAINER_SELECTOR = 'article, main, div[role="dialog"]';
const DOWNLOAD_POST_LINK_SELECTOR = 'a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]';

/**
 * @param {string} href
 * @returns {string | null} shortcode of a /p/, /reel/ or /reels/ link (opaque ids are cut at the first dash)
 */
function shortcodeFromHref(href) {
    const match = href.match(DOWNLOAD_SHORTCODE_IN_PATH);
    if (!match) return null;
    const shortcode = match[1];
    return shortcode.length > DOWNLOAD_MAX_SHORTCODE_LENGTH && shortcode.includes('-') ? shortcode.split('-')[0] : shortcode;
}

/**
 * Priority: enclosing link (grid thumbnails) > any post link in the post > address bar (post) > address bar (story id).
 * @param {Element} origin - element that represents the post in the page
 * @param {string} locationHref
 * @returns {string | null}
 */
function findShortcodeNear(origin, locationHref) {
    const anchor = origin.closest('a');
    const fromAnchor = anchor && anchor.href ? shortcodeFromHref(anchor.href) : null;
    if (fromAnchor) return fromAnchor;

    const container = origin.closest(DOWNLOAD_POST_CONTAINER_SELECTOR);
    if (container) {
        for (const link of container.querySelectorAll(DOWNLOAD_POST_LINK_SELECTOR)) {
            const fromLink = shortcodeFromHref(link.href);
            if (fromLink) return fromLink;
        }
    }
    const fromLocation = shortcodeFromHref(locationHref);
    if (fromLocation) return fromLocation;
    const storyId = locationHref.match(DOWNLOAD_STORY_ID_IN_PATH);
    return storyId ? idToShortcode(storyId[1]) : null;
}

/**
 * A missing, numeric or suspiciously long shortcode is replaced by one found in the page.
 * @param {Record<string, any>} metadata
 * @param {Element} origin
 * @param {string} locationHref
 */
function repairShortcode(metadata, origin, locationHref) {
    const current = String(metadata.shortcode);
    const needsRepair = !metadata.shortcode || DOWNLOAD_NUMERIC_MEDIA_ID.test(current) || current.length > DOWNLOAD_MAX_SHORTCODE_LENGTH;
    if (!needsRepair) return;

    const found = findShortcodeNear(origin, locationHref);
    if (found) metadata.shortcode = found;
    else if (DOWNLOAD_NUMERIC_MEDIA_ID.test(current)) metadata.shortcode = idToShortcode(current.split('_')[0]);
    else if (current.length > DOWNLOAD_MAX_SHORTCODE_LENGTH) metadata.shortcode = null;
}

/**
 * A timestamp within the last minute is a "now" fallback: the post's <time datetime> is more accurate.
 * @param {Record<string, any>} metadata
 * @param {Element} origin
 */
function completeTimestamp(metadata, origin) {
    const nowSeconds = Date.now() / 1000;
    if (!metadata.timestamp) metadata.timestamp = Math.floor(nowSeconds);
    if (Math.abs(nowSeconds - metadata.timestamp) >= DOWNLOAD_FALLBACK_TIMESTAMP_WINDOW_SECONDS) return;

    const container = origin.closest(DOWNLOAD_POST_CONTAINER_SELECTOR);
    const timeElement = container ? container.querySelector('time[datetime]') : null;
    const datetime = timeElement ? timeElement.getAttribute('datetime') : null;
    if (datetime) metadata.timestamp = Math.floor(new Date(datetime).getTime() / 1000);
}

/**
 * CDN filenames like "123_456_n.jpg" are unique per media: used as id so carousel slides never overwrite each other.
 * @param {Record<string, any>} metadata
 * @param {string | null | undefined} url
 */
function fillMediaIdFromUrl(metadata, url) {
    if (metadata.media_id || !url || !url.startsWith('http')) return;
    const filename = url.split('?')[0].split('/').pop();
    if (filename && filename.includes('_')) metadata.media_id = filename.split('.')[0];
}

/**
 * Completes (and mutates) the metadata of one download request.
 * @param {Record<string, any> | null | undefined} metadata
 * @param {Element} button - the download button that was clicked
 * @param {Element | null} originalElement - the post element when the button lives in the overlay root
 * @param {string | null | undefined} url
 * @returns {Record<string, any>} the same object (or a new one when none was given)
 */
function completeDownloadMetadata(metadata, button, originalElement, url) {
    const result = metadata || {};
    const origin = originalElement || button;
    if (!result.username) result.username = resolveUsername(button, originalElement);
    // The exact media id gives a shortcode that is unique per carousel slide / story item.
    if (result.media_id && DOWNLOAD_NUMERIC_MEDIA_ID.test(String(result.media_id))) {
        result.shortcode = idToShortcode(String(result.media_id).split('_')[0]);
    }
    repairShortcode(result, origin, window.location.href);
    completeTimestamp(result, origin);
    fillMediaIdFromUrl(result, url);
    return result;
}
