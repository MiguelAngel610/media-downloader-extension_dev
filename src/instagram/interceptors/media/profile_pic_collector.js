import { pickBestProfilePicUrl } from './media_quality.js';

/* Media Downloader - Profile Picture Collector (MAIN world)
 * Instagram's profile GraphQL/API responses already contain the full-HD avatar
 * (hd_profile_pic_url_info / hd_profile_pic_versions / profile_pic_url_hd).
 * media_parser.js walks every intercepted JSON object; this module keeps the best
 * avatar per username and forwards it to the content script (MD_PFP_RESULT), so
 * pfp_button.js no longer has to guess from the low-res <img> on screen. */

/** @typedef {{ url: string, rank: number }} ProfilePicEntry */

/** @type {Map<string, ProfilePicEntry>} lower-cased username -> best known avatar */
const knownProfilePics = new Map();
/** @type {Map<string, string>} entries not yet sent to the content script */
const pendingProfilePics = new Map();

/**
 * @param {Record<string, any>} user
 * @returns {number} source priority (higher = better source)
 */
function sourceRank(user) {
    if (user.hd_profile_pic_url_info && user.hd_profile_pic_url_info.url) return 3;
    if (Array.isArray(user.hd_profile_pic_versions) && user.hd_profile_pic_versions.length > 0) return 2;
    return 1;
}

/**
 * Called for every object visited while parsing a network response.
 * @param {Record<string, any>} obj
 */
export function recordProfilePic(obj) {
    if (typeof obj.username !== 'string' || !obj.username) return;
    if (!obj.hd_profile_pic_url_info && !obj.hd_profile_pic_versions && !obj.profile_pic_url_hd) return;

    const url = pickBestProfilePicUrl(obj);
    if (!url) return;

    const key = obj.username.toLowerCase();
    const rank = sourceRank(obj);
    const previous = knownProfilePics.get(key);
    // A weaker source seen later must never replace a full-HD one; equal ranks refresh the signed URL.
    if (previous && (previous.rank > rank || previous.url === url)) return;

    knownProfilePics.set(key, { url, rank });
    pendingProfilePics.set(key, url);
}

/** Sends the avatars collected during the last parse to the ISOLATED world. */
export function flushProfilePics() {
    if (pendingProfilePics.size === 0) return;
    for (const [username, url] of pendingProfilePics) {
        window.postMessage({ type: 'MD_PFP_RESULT', username, url }, '/');
    }
    pendingProfilePics.clear();
}
