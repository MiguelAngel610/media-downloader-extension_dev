/* Media Downloader - Story Button: Download button injected next to the 3-dots in stories */

function injectStoryButton() {
    if (!window.location.href.includes('/stories/')) return;

    let dotsBtn = null;
    let allCandidates = document.querySelectorAll('header button, header [role="button"], header svg, ._aa61 button, ._aa61 [role="button"], ._aa61 svg, section button, section [role="button"], section svg');
    for (let b of allCandidates) {
        let label = (b.getAttribute('aria-label') || '').toLowerCase();
        if (label === 'more' || label === 'más' || label === 'mas' || label.includes('opciones')) {
            let rect = b.getBoundingClientRect();
            if (window.getComputedStyle(b).display !== 'none' && rect.width > 0 && rect.height > 0) {
                dotsBtn = b.tagName.toLowerCase() === 'svg' ? (b.closest('button, [role="button"], div[role="button"]') || b) : b;
                if (dotsBtn) break;
            }
        }
    }

    if (!dotsBtn) {
        let storySvgs = document.querySelectorAll('header svg, section svg');
        for (let s of storySvgs) {
            let circles = s.querySelectorAll('circle');
            if (circles.length === 3) {
                let rect = s.getBoundingClientRect();
                if (window.getComputedStyle(s).display !== 'none' && rect.width > 0 && rect.height > 0) {
                    dotsBtn = s.closest('button, [role="button"], div[role="button"]') || s;
                    if (dotsBtn) break;
                }
            }
        }
    }

    if (dotsBtn) {
        if (dotsBtn.classList.contains('md-hijacked-dots')) {
            dotsBtn.classList.remove('md-hijacked-dots');
        }

        let header = dotsBtn.closest('header, section, ._aa61') || dotsBtn.parentNode;

        let existingBtn = header.querySelector('.md-story-dl-btn-inline');
        if (!existingBtn) {
            let dlBtn = document.createElement('div');
            dlBtn.className = 'md-native-btn md-story-dl-btn-inline';
            dlBtn.innerHTML = SVG_DOWNLOAD;
            dlBtn.style.color = 'white';
            dlBtn.style.cursor = 'pointer';
            dlBtn.style.display = 'flex';
            dlBtn.style.alignItems = 'center';
            dlBtn.style.justifyContent = 'center';
            dlBtn.style.padding = '8px';
            dlBtn.style.margin = '0';
            dlBtn.style.lineHeight = '0';
            dlBtn.style.background = 'transparent';
            dlBtn.title = "Download Story";

            dlBtn.onmouseenter = () => dlBtn.style.opacity = '0.5';
            dlBtn.onmouseleave = () => dlBtn.style.opacity = '1';

            dotsBtn.style.display = 'none';
            dotsBtn.parentNode.insertBefore(dlBtn, dotsBtn);

            dlBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                dlBtn.classList.add('md-loading');
                dlBtn.style.opacity = '0.5';

                let currentUrl = window.location.href;
                let storyIdMatch = currentUrl.match(/\/stories\/[^\/]+\/(\d+)/);
                let bestUrl = null;
                let bestMetadata = {};
                let media = null;

                if (storyIdMatch && window.__md_storyMediaDict && window.__md_storyMediaDict[storyIdMatch[1]]) {
                    bestMetadata = window.__md_storyMediaDict[storyIdMatch[1]];
                    bestUrl = bestMetadata.url;
                }

                if (!bestUrl) {
                    let mediaElements = Array.from(document.querySelectorAll('video, img'));
                    let validMedia = mediaElements.filter(el => {
                        let rect = el.getBoundingClientRect();
                        return rect.width > 200 && rect.height > 200 &&
                               rect.right > 0 && rect.left < window.innerWidth;
                    }).sort((a, b) => {
                        let aR = a.getBoundingClientRect();
                        let bR = b.getBoundingClientRect();
                        let screenCenter = window.innerWidth / 2;
                        let aDist = Math.abs((aR.left + aR.width / 2) - screenCenter);
                        let bDist = Math.abs((bR.left + bR.width / 2) - screenCenter);
                        if (Math.abs(aDist - bDist) < 10) {
                            return (bR.width * bR.height) - (aR.width * aR.height);
                        }
                        return aDist - bDist;
                    });

                    if (validMedia.length > 0) {
                        media = validMedia[0];
                        bestUrl = media.src || media.currentSrc;
                        if (media.tagName === 'VIDEO' && (!bestUrl || bestUrl === '')) {
                            let srcTag = media.querySelector('source');
                            if (srcTag) bestUrl = srcTag.src;
                        }
                    }
                }

                if (media && media.tagName === 'VIDEO' && (!bestMetadata.dash_manifest)) {
                    let id = "md_vid_" + Date.now();
                    media.setAttribute("data-md-id", id);

                    window.__md_fiberResults = window.__md_fiberResults || {};
                    window.postMessage({ type: 'MD_REQUEST_FIBER', id: id }, '*');

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
                        if (res.shortcode && res.shortcode.length > 0) { bestMetadata.shortcode = res.shortcode; }
                        if (res.media_id && res.media_id.length > 0) {
                            bestMetadata.media_id = res.media_id;
                            if (window.__md_storyMediaDict && window.__md_storyMediaDict[res.media_id]) {
                                bestMetadata = Object.assign({}, window.__md_storyMediaDict[res.media_id], bestMetadata);
                                if (bestUrl.startsWith('blob:') && bestMetadata.url) {
                                    bestUrl = bestMetadata.url;
                                }
                            }
                        }
                    }
                }

                if (bestUrl && !bestMetadata.dash_manifest) {
                    let signature = extractSignature(bestUrl);
                    if (window.__md_storyMediaDict && signature) {
                        for (let id in window.__md_storyMediaDict) {
                            let apiMedia = window.__md_storyMediaDict[id];
                            if (apiMedia.url && apiMedia.url.includes(signature)) {
                                bestUrl = apiMedia.url;
                                bestMetadata = apiMedia;
                                break;
                            }
                        }
                    }
                }

                if (!bestUrl && bestMetadata.username) {
                    bestUrl = "https://www.instagram.com/stories/" + bestMetadata.username + "/";
                }

                if (bestUrl || window.location.href.includes('/stories/')) {
                    sendDownloadRequest(dlBtn, bestUrl || window.location.href, bestMetadata, true);
                } else {
                    console.error("Media Downloader: Could not find media URL.");
                    dlBtn.classList.remove('md-loading');
                    dlBtn.style.opacity = '1';
                }
            };
        }
    }
}
