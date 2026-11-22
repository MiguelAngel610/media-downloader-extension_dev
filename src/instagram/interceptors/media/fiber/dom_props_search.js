/**
 * @fileoverview Phase 2: shallow search of DOM-attached React props (MAIN world).
 * Fallback when the fiber walk found nothing: climbs the DOM from the clicked element and inspects
 * each node's `__reactProps$*` object (shallow, never into arrays, strict shortcode/poster guards). */
import { logErrorOnce } from '../../shared/logger.js';
import { extractMediaTimestamp } from '../../shared/time_utils.js';
import { pickBestImageUrl, pickBestVideoUrl } from '../media_quality.js';
import { codeFieldOf, httpUrlOf, imageCandidatesOf, numericIdOf, usernameOf } from './field_extractors.js';
import { hasDashWithIdentity } from './search_state.js';
import { passesStrictPosterGuard } from './slide_guard.js';

/** @typedef {import('./search_state.js').FiberSearchState} FiberSearchState */

const MAX_OBJECT_DEPTH = 4;
const MAX_DOM_ANCESTORS = 50;

function isDone(state) {
    return Boolean((state.dash || state.url) && state.user && state.time);
}

/**
 * @param {Record<string, any>} obj
 * @param {FiberSearchState} state
 */
function recordMediaLoosely(obj, state) {
    if (!state.dash && typeof obj.video_dash_manifest === 'string') state.dash = obj.video_dash_manifest;
    if (!state.dash && typeof obj.dash_manifest === 'string') state.dash = obj.dash_manifest;
    if (!state.url) state.url = pickBestVideoUrl(obj.video_versions) || '';
    if (!state.url) state.url = httpUrlOf(obj.video_url) || '';
    const candidates = imageCandidatesOf(obj);
    if (!state.url && candidates) state.url = pickBestImageUrl(candidates, state.posterSig || null) || '';
}

/**
 * @param {Record<string, any>} obj
 * @param {FiberSearchState} state
 */
function recordIdentityLoosely(obj, state) {
    const id = numericIdOf(obj);
    if (id && !state.id) state.id = id;
    const code = codeFieldOf(obj);
    if (!state.code && code) state.code = code;
    const user = usernameOf(obj);
    if (!state.user && user) state.user = user;
    if (!state.time) state.time = extractMediaTimestamp(obj);
}

/**
 * @param {unknown} obj
 * @param {number} depth
 * @param {Set<object>} visited
 * @param {FiberSearchState} state
 */
function searchObject(obj, depth, visited, state) {
    if (depth > MAX_OBJECT_DEPTH || !obj || typeof obj !== 'object' || Array.isArray(obj) || visited.has(obj)) return;
    visited.add(obj);
    if (state.expectedShortcode && obj.code && typeof obj.code === 'string' && obj.code !== state.expectedShortcode) return;
    if (!passesStrictPosterGuard(obj, state.posterSig)) return; // wrong carousel slide

    recordMediaLoosely(obj, state);
    recordIdentityLoosely(obj, state);
    if (isDone(state)) return;
    for (const key of Object.keys(obj)) {
        try {
            if (!obj[key] || typeof obj[key] !== 'object') continue;
            searchObject(obj[key], depth + 1, visited, state);
            if (isDone(state)) return;
        } catch (err) {
            logErrorOnce('Fiber: DOM props walk', err);
        }
    }
}

/**
 * @param {Element} element - the clicked media element
 * @param {FiberSearchState} state
 * @param {string | undefined} requestedShortcode
 */
export function searchDomProps(element, state, requestedShortcode) {
    state.expectedShortcode = state.code || requestedShortcode;
    const visited = new Set();
    let current = element;
    for (let remaining = MAX_DOM_ANCESTORS; current && current !== document.body && remaining > 0 && !hasDashWithIdentity(state); remaining--) {
        const propsKeys = Object.keys(current).filter((key) => key.startsWith('__reactProps$') && current[key]);
        for (const key of propsKeys) {
            searchObject(current[key], 0, visited, state);
            if (hasDashWithIdentity(state)) break;
        }
        current = current.parentElement;
    }
}
