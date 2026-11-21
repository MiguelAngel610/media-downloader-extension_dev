/* Media Downloader - Media Quality (MAIN world)
 * Single place that decides "which version is the best one" for Instagram media.
 * Instagram does not guarantee the order of `video_versions` or
 * `image_versions2.candidates`, so taking `[0]` or the first match can return a
 * smaller rendition. Every extractor must go through these helpers. */

/**
 * @typedef {Object} MediaVersion
 * @property {string} [url]
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [type]
 */

/**
 * @param {MediaVersion} version
 * @returns {number}
 */
function pixelArea(version) {
    return (Number(version.width) || 0) * (Number(version.height) || 0);
}

/**
 * Highest resolution first; on ties, the higher `type` (Instagram's quality tier).
 * @param {MediaVersion} a
 * @param {MediaVersion} b
 * @returns {boolean} true when `a` is strictly better than `b`
 */
function isBetter(a, b) {
    const areaDiff = pixelArea(a) - pixelArea(b);
    if (areaDiff !== 0) return areaDiff > 0;
    return (Number(a.type) || 0) > (Number(b.type) || 0);
}

/**
 * @param {unknown} versions
 * @returns {MediaVersion | null} best version that has a URL
 */
function pickBest(versions) {
    if (!Array.isArray(versions)) return null;
    /** @type {MediaVersion | null} */
    let best = null;
    for (const version of versions) {
        if (!version || typeof version.url !== 'string' || !version.url) continue;
        if (!best || isBetter(version, best)) best = version;
    }
    return best;
}

/**
 * @param {unknown} videoVersions - `obj.video_versions`
 * @returns {string | null}
 */
export function pickBestVideoUrl(videoVersions) {
    const best = pickBest(videoVersions);
    return best ? best.url : null;
}

/**
 * @param {unknown} candidates - `obj.image_versions2.candidates`
 * @param {string | null} [signature] - When given, only candidates of that exact image
 *   (all sizes share the filename) are eligible; the largest of them wins.
 * @returns {string | null}
 */
export function pickBestImageUrl(candidates, signature = null) {
    if (!Array.isArray(candidates)) return null;
    const eligible = signature
        ? candidates.filter((c) => c && typeof c.url === 'string' && c.url.includes(signature))
        : candidates;
    const best = pickBest(eligible);
    return best ? best.url : null;
}

/**
 * Best profile picture URL inside a user object, or null.
 * Priority: hd_profile_pic_url_info (full HD) > largest hd_profile_pic_versions > profile_pic_url_hd.
 * @param {Record<string, any>} user
 * @returns {string | null}
 */
export function pickBestProfilePicUrl(user) {
    const info = user.hd_profile_pic_url_info;
    if (info && typeof info.url === 'string' && info.url) return info.url;
    const fromVersions = pickBest(user.hd_profile_pic_versions);
    if (fromVersions) return fromVersions.url;
    if (typeof user.profile_pic_url_hd === 'string' && user.profile_pic_url_hd) return user.profile_pic_url_hd;
    return null;
}
