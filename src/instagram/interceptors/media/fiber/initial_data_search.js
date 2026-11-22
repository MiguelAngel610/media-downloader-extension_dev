/**
 * @fileoverview Phase 3: server-rendered data lookup by media id (MAIN world).
 * Last resort when only the numeric id is known: finds the video in window.__initialData / _sharedData. */
import { logErrorOnce } from '../../shared/logger.js';
import { pickBestVideoUrl } from '../media_quality.js';

/** @typedef {import('./search_state.js').FiberSearchState} FiberSearchState */

const MAX_DEPTH = 10;
const ALL_DIGITS = /^\d+$/;

/**
 * @param {Record<string, any>} obj
 * @param {string} mediaId
 */
function isVideoWithId(obj, mediaId) {
    const sameId = String(obj.id) === mediaId || String(obj.pk) === mediaId || String(obj.media_id) === mediaId;
    return sameId && Boolean(obj.video_versions || obj.video_dash_manifest || obj.dash_manifest);
}

/**
 * @param {unknown} root
 * @param {string} mediaId
 * @param {Set<object>} visited - shared across roots: both globals can reference the same objects
 * @returns {Record<string, any> | null}
 */
function findVideoById(root, mediaId, visited) {
    let found = null;
    (function visit(obj, depth) {
        if (found || depth > MAX_DEPTH || !obj || typeof obj !== 'object' || visited.has(obj)) return;
        visited.add(obj);
        if (isVideoWithId(obj, mediaId)) {
            found = obj;
            return;
        }
        for (const key of Object.keys(obj)) {
            try {
                if (obj[key] && typeof obj[key] === 'object') visit(obj[key], depth + 1);
            } catch (err) {
                logErrorOnce('Fiber: initial data walk', err);
            }
        }
    })(root, 0);
    return found;
}

/**
 * @param {FiberSearchState} state - must already hold `id`
 */
export function searchInitialData(state) {
    const visited = new Set();
    const media = (window.__initialData && findVideoById(window.__initialData, state.id, visited)) ||
        (window._sharedData && findVideoById(window._sharedData, state.id, visited));
    if (!media) return;
    if (media.video_dash_manifest) state.dash = media.video_dash_manifest;
    else if (media.dash_manifest) state.dash = media.dash_manifest;
    const bestVideoUrl = pickBestVideoUrl(media.video_versions);
    if (bestVideoUrl) state.url = bestVideoUrl;
    else if (media.video_url) state.url = media.video_url;
    const codeIsValid = Boolean(media.code) && typeof media.code === 'string' && media.code.length <= 50 && !ALL_DIGITS.test(media.code);
    if (!state.code && codeIsValid) state.code = media.code;
}
