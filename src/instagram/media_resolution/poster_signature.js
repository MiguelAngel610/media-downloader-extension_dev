/**
 * @fileoverview Thumbnail ("poster") signature of the clicked media (Instagram content script).
 * The CDN filename without extension (e.g. "467003456_123_456_n") is shared by every size of the
 * same image, so the page-world fiber search uses it to pick the exact carousel slide.
 * Classic content script: names are global and must stay unique across src/instagram.
 */

const RESOLVER_FILENAME_FALLBACK = /\/([^/]+)\.(?:jpg|webp|mp4)/;

/**
 * @param {string | null | undefined} url
 * @returns {string | null} filename without extension (ignores .jpg vs .webp differences)
 */
function extractSignature(url) {
    if (!url) return null;
    try {
        const parts = new URL(url).pathname.split('/');
        return parts[parts.length - 1].replace(/\.[a-zA-Z0-9]+$/, '');
    } catch {
        // Relative or escaped URL: fall back to a plain filename match.
        const match = url.match(RESOLVER_FILENAME_FALLBACK);
        return match ? match[1] : null;
    }
}

/**
 * Nearest <img> that represents a video (Instagram renders the thumbnail next to it).
 * @param {HTMLElement} media
 * @returns {HTMLImageElement | null}
 */
function siblingThumbnailOf(media) {
    const parent = media.parentElement;
    let thumbnail = parent ? parent.querySelector('img') : null;
    if (!thumbnail && parent && parent.parentElement) thumbnail = parent.parentElement.querySelector('img');
    if (!thumbnail) {
        const slide = media.closest('li');
        if (slide) thumbnail = slide.querySelector('img');
    }
    return thumbnail;
}

/**
 * Priority for videos: poster attribute > non-blob src (a blob: URL carries no CDN filename) > sibling thumbnail.
 * @param {HTMLElement} media - <img> or <video>
 * @returns {string | null}
 */
function posterSignatureOf(media) {
    if (media.tagName === 'IMG') return extractSignature(media.src);
    if (media.tagName !== 'VIDEO') return null;
    let signature = media.poster ? extractSignature(media.poster) : null;
    if (!signature && media.src && !media.src.startsWith('blob:')) signature = extractSignature(media.src);
    if (signature) return signature;
    const thumbnail = siblingThumbnailOf(media);
    return thumbnail ? extractSignature(thumbnail.src) : null;
}
