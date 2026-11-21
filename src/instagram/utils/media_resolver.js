/* Media Downloader - Media Resolver: Resolves best media URL via Direct Fiber Bridge */

function extractSignature(url) {
    if (!url) return null;
    try {
        let parts = new URL(url).pathname.split('/');
        let filename = parts[parts.length - 1];
        // Extract filename without extension (e.g., "467003456_123_456_n")
        // This is unique to the specific slide, but ignores format differences (.jpg vs .webp)
        return filename.replace(/\.[a-zA-Z0-9]+$/, '');
    } catch (e) {
        let match = url.match(/\/([^\/]+)\.(?:jpg|webp|mp4)/);
        return match ? match[1] : null;
    }
}

async function resolveMediaUrl(media, article, knownShortcode = null, carouselIndex = null) {
    let bestUrl = null;
    let bestMetadata = {};

    if (!media) return { bestUrl, bestMetadata };

    // Set an ID to bridge with vanish.js
    let id = "md_media_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    media.setAttribute("data-md-id", id);

    let posterSig = null;
    if (media.tagName === 'IMG') {
        posterSig = extractSignature(media.src);
    } else if (media.tagName === 'VIDEO') {
        if (media.poster) {
            posterSig = extractSignature(media.poster);
        }
        // Never use a blob: src for signature
        if (!posterSig && media.src && !media.src.startsWith('blob:')) {
            posterSig = extractSignature(media.src);
        }
        // Fallback to sibling img
        if (!posterSig) {
            let siblingImg = media.parentElement ? media.parentElement.querySelector('img') : null;
            if (!siblingImg && media.parentElement && media.parentElement.parentElement) {
                siblingImg = media.parentElement.parentElement.querySelector('img');
            }
            if (!siblingImg) {
                let slide = media.closest('li');
                if (slide) siblingImg = slide.querySelector('img');
            }
            if (siblingImg) posterSig = extractSignature(siblingImg.src);
        }
    }

    let expectedShortcode = knownShortcode;
    if (!expectedShortcode) {
        let links = article ? Array.from(article.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) : [];
        if (links.length > 0) {
            let viewportCenterX = window.innerWidth / 2;
            let viewportCenterY = window.innerHeight / 2;
            
            links.sort((a, b) => {
                let aRect = a.getBoundingClientRect();
                let bRect = b.getBoundingClientRect();
                let aDist = Math.hypot((aRect.left + aRect.width / 2) - viewportCenterX, (aRect.top + aRect.height / 2) - viewportCenterY);
                let bDist = Math.hypot((bRect.left + bRect.width / 2) - viewportCenterX, (bRect.top + bRect.height / 2) - viewportCenterY);
                return aDist - bDist;
            });

            let match = links[0].href.match(/\/(?:p|reel)\/([^\/?#]+)/);
            if (match) expectedShortcode = match[1];
        }
    }

    window.__md_fiberResults = window.__md_fiberResults || {};
    window.postMessage({ type: 'MD_REQUEST_FIBER', id: id, posterSig: posterSig, shortcode: expectedShortcode, carouselIndex: carouselIndex }, '*');

    // Wait up to 500ms for result
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (window.__md_fiberResults[id] !== undefined) break;
    }

    let result = window.__md_fiberResults[id];
    delete window.__md_fiberResults[id]; // Cleanup

    if (result && (result.url || result.dash_manifest)) {
        bestUrl = result.url || null;
        bestMetadata.dash_manifest = result.dash_manifest || null;
        bestMetadata.shortcode = result.shortcode || expectedShortcode || null;
        bestMetadata.username = result.user || null;
        bestMetadata.timestamp = result.time || null; // bridge field is 'time' (see ig_interceptor_init.js)
        bestMetadata.media_id = result.media_id || null;
        if (result.index) bestMetadata.index = result.index;
        // Determine is_video from result URL or dash manifest, not from the DOM element type
        // (the media element might be an IMG thumbnail for a lazy-loaded video post)
        bestMetadata.is_video = !!(result.dash_manifest || (bestUrl && bestUrl.includes('.mp4')));
        if (bestUrl) bestMetadata.url = bestUrl;
        return { bestUrl, bestMetadata };
    }

    // Fallback dictionary
    if (window.__md_storyMediaDict) {
        let matchingItems = Object.values(window.__md_storyMediaDict);
        
        if (expectedShortcode) {
            matchingItems = matchingItems.filter(m => m.shortcode === expectedShortcode || m.code === expectedShortcode);
        }

        if (matchingItems.length > 0) {
            let targetMedia = matchingItems[0];
            
            // If there are multiple items for the same shortcode (Carousel), find our index
            if (matchingItems.length > 1) {
                let idx = -1;
                // Try URL first (for Modals)
                let imgMatch = window.location.search.match(/img_index=(\d+)/);
                if (imgMatch) {
                    idx = parseInt(imgMatch[1]) - 1;
                } else if (media) {
                    // Try DOM structure (for Feed Carousels)
                    let parentUl = media.closest('ul');
                    let myLi = media.closest('li');
                    if (parentUl && myLi) {
                        let lis = Array.from(parentUl.querySelectorAll('li'));
                        idx = lis.indexOf(myLi);
                    }
                }
                
                if (idx >= 0 && idx < matchingItems.length) {
                    targetMedia = matchingItems[idx];
                }
            }

            bestMetadata.shortcode = targetMedia.shortcode || targetMedia.code || expectedShortcode || null;
            if (targetMedia.username) bestMetadata.username = targetMedia.username;
            if (targetMedia.timestamp) bestMetadata.timestamp = targetMedia.timestamp;
            
            bestUrl = targetMedia.url || null;
            if (targetMedia.dash_manifest) {
                bestMetadata.dash_manifest = targetMedia.dash_manifest;
                bestMetadata.is_video = true;
            } else if (bestUrl && bestUrl.includes('.mp4')) {
                bestMetadata.is_video = true;
            }
            if (bestUrl) bestMetadata.url = bestUrl;
        }
    }

    return { bestUrl, bestMetadata };
}
