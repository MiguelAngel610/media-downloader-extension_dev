/* Media Downloader - Ghost Policy (MAIN world)
 * Pure functions: classify a request, then decide whether the current
 * settings require blocking it. No I/O, no DOM — network.js does the wiring. */

/** @typedef {import('./ghost_settings.js').GhostSettings} GhostSettings */
/** @typedef {'story' | 'dm' | 'presence'} GhostBlockType */
/**
 * @typedef {Object} RequestClassification
 * @property {boolean} isPresence
 * @property {boolean} isStorySeen
 * @property {boolean} isDirectSeen
 * @property {string | null} username - Story owner resolved from the payload's media/reel id
 */
/**
 * @typedef {Object} GhostDecision
 * @property {boolean} blocked
 * @property {GhostBlockType | null} type
 * @property {string | null} username
 */

const STORY_SEEN_BODY_MARKERS = Object.freeze([
    'usepolarisstoriesv3seen',
    'storiesseen',
    'storyseen',
    'story_seen',
    'xdtstoryseen',
    'ig_reels_video_view',
    'ig_story_view',
    'view_seen_at',
    'viewseenat',
]);

const STORY_SEEN_URL_MARKERS = Object.freeze([
    'stories/reels/seen',
    'v2/reels/seen',
    '/api/v1/media/seen',
    '/api/v1/stories/seen',
]);

const DIRECT_SEEN_BODY_MARKERS = Object.freeze([
    'usepolarisdirectthreadmarkreadmutation',
    'directthreadmarkreadmutation',
]);

const PRESENCE_URL_MARKERS = Object.freeze([
    '/ajax/presence/reconnect.php',
    '/api/v1/presence/',
]);

const WEBSOCKET_PRESENCE_MARKERS = Object.freeze([
    'update_presence',
    'presence_subscribe',
    'foreground_state',
]);

const MEDIA_ID_PATTERN = /"(?:reel_id|media_id)"\s*:\s*"([^"]+)"/;

/** @type {Readonly<GhostDecision>} */
export const NOT_BLOCKED = Object.freeze({ blocked: false, type: null, username: null });

/**
 * @param {string} haystack
 * @param {readonly string[]} markers
 * @returns {boolean}
 */
function includesAny(haystack, markers) {
    return markers.some((marker) => haystack.includes(marker));
}

/**
 * Resolves which user a seen request belongs to, from the payload itself (not the URL),
 * so fast story switching never attributes the view to the wrong account.
 * @param {string} bodyText
 * @returns {string | null}
 */
function resolveStoryOwner(bodyText) {
    let match = bodyText.match(MEDIA_ID_PATTERN);
    if (!match) {
        try {
            match = decodeURIComponent(bodyText).match(MEDIA_ID_PATTERN);
        } catch (err) {
            // Expected for bodies with stray '%' sequences: they simply carry no encoded id.
            if (!(err instanceof URIError)) throw err;
        }
    }
    if (!match || !match[1]) return null;
    const mediaId = match[1].split('_')[0];
    const media = window.__md_storyMedia && window.__md_storyMedia[mediaId];
    return media && media.username ? media.username : null;
}

/**
 * @param {string} url
 * @param {string} bodyText
 * @returns {RequestClassification}
 */
export function classifyRequest(url, bodyText) {
    const urlLower = url.toLowerCase();
    const bodyLower = bodyText.toLowerCase();

    const isStorySeen = includesAny(bodyLower, STORY_SEEN_BODY_MARKERS) || includesAny(urlLower, STORY_SEEN_URL_MARKERS);
    const isDirectSeen = includesAny(bodyLower, DIRECT_SEEN_BODY_MARKERS) ||
        urlLower.includes('threads/broadcast/mark_seen') ||
        (urlLower.includes('direct_v2/threads') && urlLower.includes('/seen'));
    const isPresence = includesAny(urlLower, PRESENCE_URL_MARKERS) ||
        (urlLower.includes('graphql') && bodyLower.includes('update_presence'));

    return {
        isPresence,
        isStorySeen,
        isDirectSeen,
        username: isStorySeen ? resolveStoryOwner(bodyText) : null,
    };
}

/**
 * @param {RequestClassification} classification
 * @returns {boolean} true when the outcome depends on the ghost settings
 */
export function isGhostRelevant(classification) {
    return classification.isPresence || classification.isStorySeen || classification.isDirectSeen;
}

/**
 * @param {RequestClassification} classification
 * @param {Readonly<GhostSettings>} settings
 * @returns {Readonly<GhostDecision>}
 */
export function decideGhostBlock(classification, settings) {
    if (classification.isStorySeen && (settings.vanishMode || settings.ghostSeen)) {
        return { blocked: true, type: 'story', username: classification.username };
    }
    if (classification.isDirectSeen && settings.ghostSeen) {
        return { blocked: true, type: 'dm', username: null };
    }
    if (classification.isPresence && settings.ghostOnline) {
        return { blocked: true, type: 'presence', username: null };
    }
    return NOT_BLOCKED;
}

/**
 * @param {string} payloadText
 * @returns {boolean} true for MQTT presence frames
 */
export function isWebSocketPresencePayload(payloadText) {
    return includesAny(payloadText.toLowerCase(), WEBSOCKET_PRESENCE_MARKERS);
}
