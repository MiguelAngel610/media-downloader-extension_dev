/* Media Downloader - Time Utils (MAIN world)
 * Instagram mixes units: taken_at is in seconds, while device_timestamp is often in
 * microseconds. Downstream code (filenames, host.py) expects Unix seconds. */

/**
 * @param {unknown} value - seconds, milliseconds or microseconds (number or numeric string)
 * @returns {number | null} Unix seconds, or null when the value is not a usable timestamp
 */
export function toUnixSeconds(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    if (numeric > 1e14) return Math.floor(numeric / 1e6); // microseconds
    if (numeric > 1e11) return Math.floor(numeric / 1e3); // milliseconds
    return Math.floor(numeric);
}

/**
 * Local clock time for logs ("taken at 14:05:12").
 * @param {unknown} value - seconds, milliseconds or microseconds
 * @returns {string}
 */
export function formatLocalTime(value) {
    const seconds = toUnixSeconds(value);
    return seconds ? new Date(seconds * 1000).toLocaleTimeString() : 'unknown time';
}

/**
 * First usable timestamp of an Instagram media/user object, in Unix seconds.
 * @param {Record<string, any>} obj
 * @returns {number | null}
 */
export function extractMediaTimestamp(obj) {
    return toUnixSeconds(obj.taken_at) ?? toUnixSeconds(obj.taken_at_timestamp) ?? toUnixSeconds(obj.device_timestamp);
}
