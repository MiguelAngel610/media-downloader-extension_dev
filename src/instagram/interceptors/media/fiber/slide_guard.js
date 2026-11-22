/**
 * @fileoverview Carousel slide guard (MAIN world).
 * Decides whether a carousel slide is the one the user clicked, so the filename index (_1, _2…)
 * and the media URL always come from the same slide. */
import { anyUrlIncludes, imageCandidatesOf } from './field_extractors.js';

/** @typedef {import('./search_state.js').FiberSearchState} FiberSearchState */

/**
 * @param {Record<string, any>} slide
 * @param {FiberSearchState} state
 * @returns {boolean}
 */
function matchesKnownId(slide, state) {
    const slideId = slide.pk || slide.media_id || slide.item_id || slide.id;
    return Boolean(state.id && slideId && String(slideId) === state.id);
}

/**
 * @param {Record<string, any>} slide
 * @param {string | null | undefined} posterSig
 * @returns {boolean}
 */
function matchesPoster(slide, posterSig) {
    if (!posterSig || posterSig.startsWith('blob:')) return false;
    return anyUrlIncludes(imageCandidatesOf(slide), posterSig) ||
        anyUrlIncludes(slide.video_versions, posterSig) ||
        (typeof slide.display_url === 'string' && slide.display_url.includes(posterSig)) ||
        (typeof slide.video_url === 'string' && slide.video_url.includes(posterSig));
}

/**
 * @param {Record<string, any>} slide
 * @param {FiberSearchState} state
 * @returns {boolean}
 */
function matchesFoundMedia(slide, state) {
    if (state.dash && (slide.video_dash_manifest === state.dash || slide.dash_manifest === state.dash)) return true;
    if (!state.url) return false;
    const inVersions = Array.isArray(slide.video_versions) && slide.video_versions.some((version) => version.url === state.url);
    return inVersions || slide.video_url === state.url;
}

/**
 * Strategies in order of reliability: unique id (works for blob: videos), thumbnail signature,
 * then the manifest/URL already found on the clicked element.
 * @param {Record<string, any>} slide
 * @param {FiberSearchState} state
 * @returns {boolean}
 */
export function isTargetSlide(slide, state) {
    return matchesKnownId(slide, state) || matchesPoster(slide, state.posterSig) || matchesFoundMedia(slide, state);
}

/**
 * Stricter variant used by the DOM-props fallback: only image candidates and video versions count.
 * @param {Record<string, any>} obj
 * @param {string | null | undefined} posterSig
 * @returns {boolean} true when the object passes (no poster to check, or the poster matches)
 */
export function passesStrictPosterGuard(obj, posterSig) {
    if (!posterSig || !(obj.image_versions2 || obj.video_versions)) return true;
    return anyUrlIncludes(imageCandidatesOf(obj), posterSig) || anyUrlIncludes(obj.video_versions, posterSig);
}
