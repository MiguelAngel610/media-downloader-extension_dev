/**
 * @fileoverview Fiber field extractors (MAIN world).
 * Pure readers for the Instagram media/user objects found in React props.
 * No state, no DOM: each answers one question about a single object. */

const SHORTCODE_MIN_LENGTH = 10;
const SHORTCODE_MAX_LENGTH = 50;
const MANIFEST_MIN_LENGTH = 50;
const NUMERIC_ID = /^\d+(_\d+)?$/;
const ALL_DIGITS = /^\d+$/;

/**
 * @param {unknown} value
 * @returns {value is string} a plausible shortcode (opaque ids can reach 39 chars, numeric ids are not shortcodes)
 */
function isShortcode(value) {
    return typeof value === 'string' && value.length >= SHORTCODE_MIN_LENGTH && value.length <= SHORTCODE_MAX_LENGTH && !ALL_DIGITS.test(value);
}

/**
 * @param {Record<string, any>} obj
 * @returns {string | null} `code`, else `shortcode`, when it looks like a real shortcode
 */
export function shortcodeOf(obj) {
    if (isShortcode(obj.code)) return obj.code;
    if (isShortcode(obj.shortcode)) return obj.shortcode;
    return null;
}

/**
 * @param {Record<string, any>} obj
 * @returns {string | null} only the `code` field (the DOM-props fallback never trusts `shortcode`)
 */
export function codeFieldOf(obj) {
    return isShortcode(obj.code) ? obj.code : null;
}

/**
 * @param {Record<string, any>} obj
 * @returns {string | null} numeric media id from pk / media_id / item_id
 */
export function numericIdOf(obj) {
    const raw = obj.pk || obj.media_id || obj.item_id;
    if (!raw || (typeof raw !== 'string' && typeof raw !== 'number')) return null;
    const id = String(raw);
    return NUMERIC_ID.test(id) ? id : null;
}

/**
 * @param {Record<string, any>} obj
 * @returns {string | null} owner username from user / owner / author, else a bare `username` without spaces
 */
export function usernameOf(obj) {
    if (obj.user && obj.user.username) return obj.user.username;
    if (obj.owner && obj.owner.username) return obj.owner.username;
    if (obj.author && obj.author.username) return obj.author.username;
    if (typeof obj.username === 'string' && !obj.username.includes(' ')) return obj.username || null;
    return null;
}

/**
 * @param {Record<string, any>} obj
 * @returns {Array<Record<string, any>> | null} slides of a carousel (REST `carousel_media` or GraphQL sidecar edges)
 */
export function carouselItemsOf(obj) {
    if (Array.isArray(obj.carousel_media)) return obj.carousel_media;
    const edges = obj.edge_sidecar_to_children && obj.edge_sidecar_to_children.edges;
    return Array.isArray(edges) ? edges.map((edge) => edge.node) : null;
}

/**
 * @param {unknown} value
 * @returns {string | null} the value when it is real MPD XML (not a stub)
 */
export function validManifestOf(value) {
    if (typeof value !== 'string' || value.length <= MANIFEST_MIN_LENGTH) return null;
    return value.includes('<MPD') || value.includes('<Period') ? value : null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function httpUrlOf(value) {
    return typeof value === 'string' && value.startsWith('http') ? value : null;
}

/**
 * @param {Record<string, any>} obj
 * @returns {boolean} the object carries downloadable media
 */
export function hasMediaFields(obj) {
    return Boolean(obj.image_versions2 || obj.video_versions || obj.display_url || obj.video_url || obj.video_dash_manifest);
}

/**
 * @param {Record<string, any>} obj
 * @returns {Array<{ url?: string }> | null}
 */
export function imageCandidatesOf(obj) {
    return obj.image_versions2 && Array.isArray(obj.image_versions2.candidates) ? obj.image_versions2.candidates : null;
}

/**
 * @param {Array<{ url?: string }> | null | undefined} versions
 * @param {string} needle
 * @returns {boolean}
 */
export function anyUrlIncludes(versions, needle) {
    return Array.isArray(versions) && versions.some((version) => version.url && version.url.includes(needle));
}
