/* Media Downloader - Username Utils (MAIN world)
 * One canonical form for Instagram usernames used as storage keys. */

/**
 * @param {unknown} value
 * @returns {string | null} trimmed, lowercase username; null when empty or not a string
 */
export function normalizeUsername(value) {
    return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}
