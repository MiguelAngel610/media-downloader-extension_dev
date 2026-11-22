/**
 * @fileoverview Phase 1: recursive search of React props (MAIN world).
 * Walks one props object looking for the clicked post's media, owner and date.
 * Order per object: guard shortcode -> record identity -> carousel? -> slide guard -> record media -> recurse. */
import { logErrorOnce } from '../../shared/logger.js';
import { extractMediaTimestamp } from '../../shared/time_utils.js';
import { pickBestImageUrl, pickBestVideoUrl } from '../media_quality.js';
import { carouselItemsOf, hasMediaFields, httpUrlOf, imageCandidatesOf, numericIdOf, shortcodeOf, usernameOf, validManifestOf } from './field_extractors.js';
import { hasDashWithIdentity, takeMedia } from './search_state.js';
import { isTargetSlide } from './slide_guard.js';

/** @typedef {import('./search_state.js').FiberSearchState} FiberSearchState */

const MAX_PROPS_DEPTH = 15;
const CAROUSEL_KEYS = new Set(['carousel_media', 'edge_sidecar_to_children']);

/**
 * @param {Record<string, any>} obj
 * @param {FiberSearchState} state
 * @param {string | null} code
 */
function recordIdentity(obj, state, code) {
    if (!state.code && code) state.code = code;
    const id = numericIdOf(obj);
    if (id && !state.id) state.id = id;
    const user = usernameOf(obj);
    if (!state.user && user) state.user = user;
    if (!state.time) state.time = extractMediaTimestamp(obj);
}

/**
 * @param {Record<string, any>} obj
 * @param {FiberSearchState} state
 * @param {number} slideIndex
 */
function recordMedia(obj, state, slideIndex) {
    takeMedia(state, 'dash', validManifestOf(obj.video_dash_manifest), slideIndex);
    takeMedia(state, 'dash', validManifestOf(obj.dash_manifest), slideIndex);
    takeMedia(state, 'url', pickBestVideoUrl(obj.video_versions), slideIndex);
    takeMedia(state, 'url', httpUrlOf(obj.video_url), slideIndex);
    const candidates = imageCandidatesOf(obj);
    // With posterSig only this slide's candidates are eligible (no match = wrong slide); the largest wins.
    if (candidates && candidates.length > 0) takeMedia(state, 'url', pickBestImageUrl(candidates, state.posterSig || null), slideIndex);
    takeMedia(state, 'url', httpUrlOf(obj.display_url), slideIndex);
}

/**
 * Searches every child object; stops as soon as a video with full identity is known.
 * @param {Record<string, any>} obj
 * @param {Iterable<string>} keys
 * @param {{ depth: number, visited: Set<object>, state: FiberSearchState, code: string | null, slideIndex: number, context: string }} walk
 */
function searchChildren(obj, keys, walk) {
    for (const key of keys) {
        try {
            const child = obj[key];
            if (!child || typeof child !== 'object') continue;
            searchProps(child, walk.depth + 1, walk.visited, walk.state, walk.code, walk.slideIndex);
            if (hasDashWithIdentity(walk.state)) return;
        } catch (err) {
            logErrorOnce(walk.context, err); // exotic React props can throw on access
        }
    }
}

/**
 * @returns {boolean} true when the carousel fully handled this object (caller must stop)
 */
function searchCarousel(obj, slides, depth, visited, state, code) {
    if (state.carouselIndex) {
        const target = state.carouselIndex - 1;
        if (target < 0 || target >= slides.length) return false; // out of range: treat the container as plain media
        state.posterSig = null; // the explicit index is more reliable than the thumbnail
        state.index = state.carouselIndex;
        searchProps(slides[target], depth + 1, visited, state, code);
        return true;
    }
    // The container itself carries no slide media: each slide is searched with its position.
    for (let i = 0; i < slides.length; i++) {
        try {
            if (!slides[i] || typeof slides[i] !== 'object') continue;
            searchProps(slides[i], depth + 1, visited, state, code, i);
            if (hasDashWithIdentity(state)) return true;
        } catch (err) {
            logErrorOnce('Fiber: carousel item', err);
        }
    }
    const siblingKeys = Object.keys(obj).filter((key) => !CAROUSEL_KEYS.has(key));
    searchChildren(obj, siblingKeys, { depth, visited, state, code, slideIndex: -1, context: 'Fiber: carousel sibling prop' });
    return true;
}

/** Too deep, not an object, or already visited (cyclic props). */
function isOutOfReach(obj, depth, visited) {
    return depth > MAX_PROPS_DEPTH || !obj || typeof obj !== 'object' || visited.has(obj);
}

/** The object belongs to a neighbouring/pinned post, not the one that was clicked. */
function isForeignPost(state, code) {
    return Boolean(state.expectedShortcode && code && code !== state.expectedShortcode);
}

/** Inside a carousel, media of any other slide must be ignored. */
function isWrongSlide(obj, state, slideIndex) {
    return slideIndex >= 0 && hasMediaFields(obj) && !isTargetSlide(obj, state);
}

/** An image post (no video on this object) is complete once its URL, owner and date are known. */
function isImageComplete(obj, state) {
    return Boolean(state.url && state.user && state.time && !obj.video_versions && !obj.video_url);
}

/**
 * @param {unknown} obj
 * @param {number} depth
 * @param {Set<object>} visited - shared per root so cyclic props terminate
 * @param {FiberSearchState} state
 * @param {string | null} [inheritedCode]
 * @param {number} [slideIndex] - 0-based slide when inside a carousel, -1 otherwise
 */
export function searchProps(obj, depth, visited, state, inheritedCode = null, slideIndex = -1) {
    if (isOutOfReach(obj, depth, visited)) return;
    visited.add(obj);

    const code = shortcodeOf(obj) || inheritedCode;
    if (isForeignPost(state, code)) return;
    recordIdentity(obj, state, code);

    const slides = carouselItemsOf(obj);
    if (slides && searchCarousel(obj, slides, depth, visited, state, code)) return;
    if (isWrongSlide(obj, state, slideIndex)) return;

    recordMedia(obj, state, slideIndex);
    if (hasDashWithIdentity(state) || isImageComplete(obj, state)) return;
    searchChildren(obj, Object.keys(obj), { depth, visited, state, code, slideIndex, context: 'Fiber: prop walk' });
}
