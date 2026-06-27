/* Media Downloader - Platform Utils */

function getPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes("instagram.com")) return "instagram";
    if (hostname.includes("facebook.com")) return "facebook";
    if (hostname.includes("twitter.com") || hostname.includes("x.com")) return "twitter";
    return "unknown";
}

function extractSignature(url) {
    if (!url) return null;
    try {
        let urlObj = new URL(url);
        let parts = urlObj.pathname.split('/');
        return parts[parts.length - 1];
    } catch(e) {
        let match = url.match(/\/([^\/]+\.(jpg|webp|mp4))/);
        return match ? match[1] : null;
    }
}

function idToShortcode(idStr) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    try {
        let num = BigInt(idStr);
        let res = '';
        while (num > 0n) {
            res = alphabet[Number(num % 64n)] + res;
            num /= 64n;
        }
        return res;
    } catch(e) {
        return idStr; // fallback to original if parsing fails
    }
}
