/**
 * @fileoverview Decides what the host should download (Instagram content script).
 * Direct CDN URLs and DASH manifests are downloaded natively ("direct_story"). A blob: URL cannot
 * leave the page, so the story/post page URL is sent instead and resolved by gallery-dl ("auto").
 * Classic content script: names are global and must stay unique across src/instagram.
 */

const DOWNLOAD_STORY_WITH_ID_IN_PATH = /\/stories\/([^/]+)\/(\d+)/;
const DOWNLOAD_POST_OR_REEL_IN_PATH = /\/(?:p|reel)\/([a-zA-Z0-9_-]+)/;
const DOWNLOAD_INSTAGRAM_ORIGIN = 'https://www.instagram.com';

/**
 * @typedef {Object} DownloadTarget
 * @property {string} url
 * @property {string} mediaType - "direct_story" (native download) or "auto" (gallery-dl / yt-dlp)
 */

/**
 * @param {Element | null} button
 * @returns {boolean} the request comes from the story viewer
 */
function isStoryContext(button) {
    return Boolean(button && button.classList.contains('md-story-dl-btn-inline')) || window.location.href.includes('/stories/');
}

/**
 * @param {Record<string, any>} metadata
 * @param {string} locationHref
 * @returns {string | null}
 */
function storyPageUrl(metadata, locationHref) {
    if (DOWNLOAD_STORY_WITH_ID_IN_PATH.test(locationHref)) return locationHref;
    if (metadata.username && metadata.media_id) {
        return `${DOWNLOAD_INSTAGRAM_ORIGIN}/stories/${metadata.username}/${String(metadata.media_id).split('_')[0]}/`;
    }
    return metadata.username ? `${DOWNLOAD_INSTAGRAM_ORIGIN}/stories/${metadata.username}/` : null;
}

/**
 * @param {Record<string, any>} metadata
 * @param {string} locationHref
 * @returns {string | null}
 */
function postPageUrl(metadata, locationHref) {
    if (metadata.shortcode) return `${DOWNLOAD_INSTAGRAM_ORIGIN}/p/${metadata.shortcode}/`;
    const match = locationHref.match(DOWNLOAD_POST_OR_REEL_IN_PATH);
    return match ? `${DOWNLOAD_INSTAGRAM_ORIGIN}/p/${match[1]}/` : null;
}

/**
 * @param {Element} button
 * @param {string | null | undefined} url
 * @param {Record<string, any>} metadata - already completed by completeDownloadMetadata
 * @returns {DownloadTarget | null} null when a blob: URL cannot be mapped to any page URL
 */
function resolveDownloadTarget(button, url, metadata) {
    if (getPlatform() !== 'instagram') return { url, mediaType: 'auto' };
    const isBlobWithoutManifest = Boolean(url && url.startsWith('blob:') && !metadata.dash_manifest);
    if (!isBlobWithoutManifest) return { url, mediaType: metadata.mediaType || 'direct_story' };

    const locationHref = window.location.href;
    const pageUrl = isStoryContext(button) ? storyPageUrl(metadata, locationHref) : postPageUrl(metadata, locationHref);
    return pageUrl ? { url: pageUrl, mediaType: 'auto' } : null;
}
