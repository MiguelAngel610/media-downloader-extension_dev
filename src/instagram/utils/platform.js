/* Media Downloader - Platform Utils */

export function getPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes("instagram.com")) return "instagram";
    if (hostname.includes("facebook.com")) return "facebook";
    if (hostname.includes("twitter.com") || hostname.includes("x.com")) return "twitter";
    return "unknown";
}

export function idToShortcode(idStr) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    try {
        let num = BigInt(idStr);
        let res = '';
        while (num > 0n) {
            res = alphabet[Number(num % 64n)] + res;
            num /= 64n;
        }
        return res;
    } catch {
        return idStr; // Not a numeric media id (BigInt throws): it already is a shortcode
    }
}
