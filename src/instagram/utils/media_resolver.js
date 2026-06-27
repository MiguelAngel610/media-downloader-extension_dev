/* Media Downloader - Media Resolver: Resolves best media URL via Fiber, vanish dict, and fallbacks */

async function resolveMediaUrl(media, article) {
    let bestUrl = null;
    let bestMetadata = {};

    if (!media) return { bestUrl, bestMetadata };

    let src = media.src;
    if (media.tagName === 'IMG') src = media.currentSrc || media.src;
    bestUrl = src;

    function getRealShortcode(element) {
        const rgx = /\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)(?:[/?]|$)/;
        let s = null;
        if (article) {
            let links = article.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]');
            for (let a of links) {
                let m = a.href.match(rgx);
                if (m) { s = m[1]; break; }
            }
        }
        if (!s) {
            let m2 = window.location.href.match(rgx);
            if (m2) s = m2[1];
        }
        if (!s) {
            let og = document.querySelector('meta[property="og:url"]');
            if (og && og.content) { let m3 = og.content.match(rgx); if (m3) s = m3[1]; }
        }
        if (s && s.length > 15 && s.includes('-')) {
            s = s.split('-')[0];
        }
        return s;
    }

    let expectedShortcode = getRealShortcode(media);
    bestMetadata.shortcode = expectedShortcode;

    // === STEP 1: Try vanish.js intercepted dictionary ===
    if (window.__md_storyMediaDict) {
        let signature = extractSignature(src);
        if (signature) {
            for (let id in window.__md_storyMediaDict) {
                let apiMedia = window.__md_storyMediaDict[id];
                if ((apiMedia.url && apiMedia.url.includes(signature)) ||
                    (apiMedia.signatures && apiMedia.signatures.includes(signature))) {
                    bestUrl = apiMedia.url;
                    bestMetadata = Object.assign({}, apiMedia, bestMetadata);
                    break;
                }
            }
        }
    }

    // === STEP 2: React Fiber extraction (runs in page context) ===
    if (media.tagName === 'VIDEO' && (!bestMetadata.dash_manifest)) {
        let id = "md_vid_" + Date.now();
        media.setAttribute("data-md-id", id);

        window.__md_fiberResults = window.__md_fiberResults || {};
        window.postMessage({ type: 'MD_REQUEST_FIBER', id: id, shortcode: expectedShortcode }, '*');

        // Wait up to 500ms for result
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 50));
            if (window.__md_fiberResults[id]) break;
        }

        let res = window.__md_fiberResults[id];
        if (res) {
            let extractedUrl = res.url;
            let extractedDash = res.dash;
            if (extractedUrl && extractedUrl.length > 0) { bestUrl = extractedUrl; bestMetadata.url = bestUrl; }
            if (extractedDash && extractedDash.length > 50) {
                let decoded = extractedDash;
                try { if (extractedDash.includes('%3C') || extractedDash.includes('%3c')) decoded = decodeURIComponent(extractedDash); } catch(e) {}
                if (decoded.includes('<MPD') || decoded.includes('<Period')) {
                    bestMetadata.dash_manifest = decoded;
                }
            }
            if (res.media_id && res.media_id.length > 0) { bestMetadata.media_id = res.media_id; }
            if (res.shortcode && res.shortcode.length > 0) { bestMetadata.shortcode = res.shortcode; expectedShortcode = res.shortcode; }
        }
    }

    // === STEP 4: Vanish dict brute-force ===
    if (media.tagName === 'VIDEO' && (!bestUrl || bestUrl.startsWith('blob:')) && !bestMetadata.dash_manifest) {
        if (window.__md_storyMediaDict) {
            let videos = Object.values(window.__md_storyMediaDict).filter(m => m.is_video || m.dash_manifest);

            if (expectedShortcode) {
                let matched = videos.find(m => m.code === expectedShortcode);
                if (matched) {
                    bestMetadata = Object.assign({}, matched, bestMetadata);
                    if (bestMetadata.url) bestUrl = bestMetadata.url;
                }
            }

            if ((!bestUrl || bestUrl.startsWith('blob:')) && !bestMetadata.dash_manifest && videos.length > 0) {
                let imgMatch = window.location.search.match(/img_index=(\d+)/);
                let idx = imgMatch ? parseInt(imgMatch[1]) - 1 : 0;
                if (idx < 0 || idx >= videos.length) idx = 0;
                bestMetadata = Object.assign({}, videos[idx] || videos[0], bestMetadata);
                if (bestMetadata.url) bestUrl = bestMetadata.url;
            }
        }
    }

    return { bestUrl, bestMetadata };
}
