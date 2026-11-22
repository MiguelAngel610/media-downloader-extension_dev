/**
 * @fileoverview Best URL and metadata of the story on screen (Instagram content script).
 * Sources, most reliable first: the API dictionary entry of this story id
 * (window.__md_storyMediaDict), the page-world fiber search (fills a missing DASH manifest, user or
 * date of videos), a CDN filename match in the dictionary, and finally the profile's stories URL.
 * Classic content script: names are global and must stay unique across src/instagram.
 */

const STORY_FIBER_POLL_INTERVAL_MS = 50;
const STORY_FIBER_MAX_POLLS = 10;
const STORY_FRESH_TIMESTAMP_WINDOW_S = 86400;
const STORY_MIN_DASH_LENGTH = 50;

/**
 * @typedef {Object} StoryResolution
 * @property {string | null | undefined} bestUrl
 * @property {Record<string, any>} bestMetadata
 */

/** @returns {Record<string, any> | null} a copy of this story's dictionary entry (never mutate the shared cache) */
function storyEntryFromDictionary() {
    const storyId = currentStoryId();
    const dictionary = window.__md_storyMediaDict;
    return storyId && dictionary && dictionary[storyId] ? Object.assign({}, dictionary[storyId]) : null;
}

/**
 * Videos are enriched by the fiber search when the entry lacks a DASH manifest, an author, or a date
 * older than a day (a "fresh" timestamp may be the time the page saw it, not the upload time).
 * @param {HTMLElement | null} media
 * @param {Record<string, any>} metadata
 */
function needsFiberEnrichment(media, metadata) {
    if (!media || media.tagName !== 'VIDEO') return false;
    const isFreshTimestamp = Math.abs(Date.now() / 1000 - metadata.timestamp) < STORY_FRESH_TIMESTAMP_WINDOW_S;
    return !metadata.dash_manifest || !metadata.username || !metadata.timestamp || isFreshTimestamp;
}

/**
 * @param {HTMLElement} media - tagged with data-md-id so the page world can find its React fiber
 * @returns {Promise<Record<string, any> | undefined>} stored MD_FIBER_RESULT, undefined on timeout
 */
async function requestStoryFiberAnswer(media) {
    const id = `md_vid_${Date.now()}`;
    media.setAttribute('data-md-id', id);
    window.__md_fiberResults = window.__md_fiberResults || {};
    window.postMessage({ type: 'MD_REQUEST_FIBER', id }, '*');
    for (let poll = 0; poll < STORY_FIBER_MAX_POLLS; poll++) {
        await new Promise((resolve) => setTimeout(resolve, STORY_FIBER_POLL_INTERVAL_MS));
        if (window.__md_fiberResults[id]) break;
    }
    return window.__md_fiberResults[id];
}

/**
 * @param {string} rawManifest - possibly URI-encoded DASH XML
 * @returns {string | null} the manifest when it looks like DASH XML
 */
function decodeDashManifest(rawManifest) {
    let decoded = rawManifest;
    try {
        if (rawManifest.includes('%3C') || rawManifest.includes('%3c')) decoded = decodeURIComponent(rawManifest);
    } catch (err) {
        // URIError: a literal "%3C" inside plain XML; the manifest is used as-is.
        if (!(err instanceof URIError)) window.MDErrorReporter.reportError('IG Story: DASH manifest decode', err);
    }
    return decoded.includes('<MPD') || decoded.includes('<Period') ? decoded : null;
}

/**
 * Applies the non-empty fiber fields. The dictionary URL (matched by exact story id) is already the
 * best version, so fiber only replaces a missing or blob: URL.
 * @param {StoryResolution} resolution - updated in place
 * @param {Record<string, any>} answer - stored MD_FIBER_RESULT
 */
function mergeFiberAnswer(resolution, answer) {
    const { bestUrl, bestMetadata } = resolution;
    const dictionaryHasRealUrl = bestUrl && !bestUrl.startsWith('blob:') && bestMetadata.url === bestUrl;
    if (answer.url && answer.url.length > 0 && !dictionaryHasRealUrl) {
        resolution.bestUrl = answer.url;
        bestMetadata.url = answer.url;
    }
    if (answer.dash && answer.dash.length > STORY_MIN_DASH_LENGTH) {
        const manifest = decodeDashManifest(answer.dash);
        if (manifest) bestMetadata.dash_manifest = manifest;
    }
    if (answer.shortcode && answer.shortcode.length > 0) bestMetadata.shortcode = answer.shortcode;
    // Bridge fields are 'user' and 'time' (ig_interceptor_init.js).
    if (answer.user && answer.user.length > 0) bestMetadata.username = answer.user;
    if (answer.time) bestMetadata.timestamp = answer.time;
    if (answer.media_id && answer.media_id.length > 0) mergeDictionaryEntryById(resolution, answer.media_id);
}

/**
 * @param {StoryResolution} resolution - updated in place; current fields win over the dictionary's
 * @param {string} mediaId
 */
function mergeDictionaryEntryById(resolution, mediaId) {
    resolution.bestMetadata.media_id = mediaId;
    const entry = window.__md_storyMediaDict && window.__md_storyMediaDict[mediaId];
    if (!entry) return;
    resolution.bestMetadata = Object.assign({}, entry, resolution.bestMetadata);
    if (resolution.bestUrl.startsWith('blob:') && resolution.bestMetadata.url) resolution.bestUrl = resolution.bestMetadata.url;
}

/**
 * Without a DASH manifest, a dictionary entry with the same CDN filename is the full-quality version.
 * @param {StoryResolution} resolution - updated in place
 */
function upgradeBySignature(resolution) {
    if (!resolution.bestUrl || resolution.bestMetadata.dash_manifest) return;
    const signature = extractSignature(resolution.bestUrl);
    if (!window.__md_storyMediaDict || !signature) return;
    const match = Object.values(window.__md_storyMediaDict).find((entry) => entry.url && entry.url.includes(signature));
    if (!match) return;
    resolution.bestUrl = match.url;
    resolution.bestMetadata = match;
}

/**
 * @param {HTMLElement | null} media - story element on screen
 * @returns {Promise<StoryResolution>}
 */
async function resolveStoryMedia(media) {
    const entry = storyEntryFromDictionary();
    const resolution = { bestUrl: entry ? entry.url : null, bestMetadata: entry || {} };
    if (!resolution.bestUrl && media) resolution.bestUrl = directMediaUrl(media);
    if (needsFiberEnrichment(media, resolution.bestMetadata)) {
        const answer = await requestStoryFiberAnswer(media);
        if (answer) mergeFiberAnswer(resolution, answer);
    }
    upgradeBySignature(resolution);
    // gallery-dl can still download the whole story reel of the author.
    if (!resolution.bestUrl && resolution.bestMetadata.username) {
        resolution.bestUrl = `https://www.instagram.com/stories/${resolution.bestMetadata.username}/`;
    }
    return resolution;
}
