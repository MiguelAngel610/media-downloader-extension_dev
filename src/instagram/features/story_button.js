/* Media Downloader - Story Button: Download button injected next to the 3-dots in stories */

function syncStoryButtonState(btn) {
    let parent = document.body;
    let currentKey = typeof getStoryKey === 'function' ? getStoryKey() : window.location.pathname;
    let state = parent && parent.__md_download_state;

    if (state && state.storyKey === currentKey && (Date.now() - state.time < 2000)) {
        if (!btn.classList.contains(state.class)) {
            btn.className = 'md-native-btn md-story-dl-btn-inline ' + state.class;
            btn.innerHTML = state.html;
            if (state.class === 'md-loading') {
                btn.style.opacity = '0.5';
                btn.style.background = 'rgba(255, 255, 255, 0.3)';
            } else if (state.class === 'md-success') {
                btn.style.opacity = '1';
                btn.style.background = 'transparent';
            }
        }
    } else {
        if (btn.classList.contains('md-loading') || btn.classList.contains('md-success')) {
            btn.className = 'md-native-btn md-story-dl-btn-inline';
            if (typeof SVG_DOWNLOAD !== 'undefined') btn.innerHTML = SVG_DOWNLOAD;
            btn.style.opacity = '1';
            btn.style.background = 'transparent';
        }
        if (state && state.storyKey === currentKey && Date.now() - state.time >= 2000) {
            delete parent.__md_download_state;
        }
    }
}

function detectSharedReelOrPost() {
    // Check 0: Ground Truth from Instagram API JSON internal dictionary
    let currentUrl = window.location.href;
    let storyIdMatch = currentUrl.match(/\/stories\/[^\/]+\/(\d+)/);
    if (storyIdMatch && window.__md_storyMediaDict && window.__md_storyMediaDict[storyIdMatch[1]]) {
        let meta = window.__md_storyMediaDict[storyIdMatch[1]];
        if (meta.shared_item) {
            return { detected: true, ...meta.shared_item };
        }
    }

    // Check 1: Find visible or hidden links pointing to Reels, Posts, or IGTV within the central story viewport
    let links = Array.from(document.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"], a[href*="/tv/"]'));
    for (let link of links) {
        if (link.closest('#md-reel-warning-toast, [id^="md-"], [class*="md-"]')) continue;
        let rect = link.getBoundingClientRect();
        let center = rect.left + (rect.width / 2);
        let xPos = rect.width > 0 ? center : rect.left;
        
        if (Math.abs(xPos - window.innerWidth / 2) < 360 && rect.top >= -100 && rect.bottom <= window.innerHeight + 100) {
            let style = window.getComputedStyle(link);
            if (style.visibility === 'hidden' || style.opacity === '0' || style.display === 'none') continue;
            let href = link.getAttribute('href') || '';
            let isReel = href.includes('/reel/') || href.includes('/reels/') || href.includes('/tv/');
            let label = link.textContent.trim() || (isReel ? 'Watch full reel' : 'See post');
            return { detected: true, isReel, label, href: link.href, element: link };
        }
    }

    // Check 2: Find text badges like "See post", "Watch full reel", "Ver reel completo", "Ver publicación", "See photo"
    let allEls = Array.from(document.querySelectorAll('*'));
    let keywordsRegex = /(?:watch|ver|view|see|mirar)\s+(?:full\s+)?(?:reel|post|publicaci[oó]n|video|v[íi]deo|igv|photo|foto|content|contenido)/i;
    
    for (let el of allEls) {
        if (el.closest('#md-reel-warning-toast, [id^="md-"], [class*="md-"]')) continue;
        if (el.children.length <= 2 && el.textContent) {
            let text = el.textContent.trim();
            if (text.length >= 4 && text.length <= 50 && keywordsRegex.test(text)) {
                let style = window.getComputedStyle(el);
                if (style.visibility === 'hidden' || style.opacity === '0' || style.display === 'none') continue;

                let rect = el.getBoundingClientRect();
                let center = rect.left + (rect.width / 2);
                let xPos = rect.width > 0 ? center : rect.left;
                
                if (Math.abs(xPos - window.innerWidth / 2) < 360 && rect.top >= -100 && rect.bottom <= window.innerHeight + 100) {
                    let isReel = /reel|video|v[íi]deo|igv/i.test(text);
                    let linkAncestor = el.closest('a[href]') || el.querySelector('a[href]');
                    let href = linkAncestor ? linkAncestor.href : null;
                    return { detected: true, isReel, label: text, href: href, element: el };
                }
            }
        }
    }

    // Check 3: Find standalone "@username" attributions rendered under a re-shared feed card in stories
    for (let el of allEls) {
        if (el.closest('#md-reel-warning-toast, [id^="md-"], [class*="md-"]')) continue;
        if (el.children.length === 0 && el.textContent) {
            let text = el.textContent.trim();
            if (text.startsWith('@') && text.length >= 2 && text.length <= 40 && !text.includes(' ')) {
                let style = window.getComputedStyle(el);
                if (style.visibility === 'hidden' || style.opacity === '0' || style.display === 'none') continue;

                let rect = el.getBoundingClientRect();
                let center = rect.left + (rect.width / 2);
                let xPos = rect.width > 0 ? center : rect.left;
                
                // Inspect within central story viewport, below author header (top >= 120) and above reply input (bottom <= innerHeight - 60)
                if (Math.abs(xPos - window.innerWidth / 2) < 360 && rect.top >= 120 && rect.bottom <= window.innerHeight - 60) {
                    let clickable = el.closest('[role="button"], button, a, div[tabindex]') || el;
                    let linkAncestor = el.closest('a[href]') || el.querySelector('a[href]');
                    let href = linkAncestor ? linkAncestor.href : null;
                    return { detected: true, isReel: false, label: text, href: href, element: clickable };
                }
            }
        }
    }

    // If no shared media detected in this story, clean up any outdated warning toast from previous stories
    let outdatedToast = document.getElementById('md-reel-warning-toast');
    if (outdatedToast) outdatedToast.remove();

    return { detected: false };
}

function showSharedReelWarning(info) {
    if (!window.MDToastManager) return;

    let typeText = info.isReel ? 'Reel' : 'Post';
    let typeIcon = info.isReel ? '🎬' : '🖼️';

    let btnActionHtml = info.href ? `
        <a href="${info.href}" target="_blank" style="display: flex; align-items: center; justify-content: center; gap: 6px; background: #2563eb; color: #ffffff; font-weight: 600; font-size: 13px; padding: 10px 14px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.25); transition: background 0.2s;">
            <span>Open Full ${typeText}</span>
        </a>
    ` : `
        <div style="cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; background: #2563eb; color: #ffffff; font-weight: 600; font-size: 13px; padding: 10px 14px; border-radius: 8px; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.25);">
            <span>Open Full ${typeText}</span>
        </div>
    `;

    window.MDToastManager.showComplex({
        title: `Shared ${typeText} Detected`,
        icon: '⚠️',
        body: `To preserve studio FHD quality and aesthetics, downloading shared ${typeText.toLowerCase()}s directly from stories is disabled to prevent cropped media, re-compression, and baked-in interface overlays.`,
        actionHtml: btnActionHtml,
        onAction: (e) => {
            if (!info.href && info.element) {
                try { info.element.click(); } catch(err) {}
            }
        },
        duration: 8000
    });
}

function injectStoryButton() {
    if (!window.location.href.includes('/stories/')) return;

    let currentStoryKey = (typeof getStoryKey === 'function') ? getStoryKey() : window.location.pathname;
    if (window.__md_lastActiveStoryKey && window.__md_lastActiveStoryKey !== currentStoryKey) {
        // Active story slide changed! Drop cached dots from previous story slide
        window.__md_cachedStoryDots = null;

        // Reset any existing story download buttons in DOM to clean default state
        let storyBtns = document.querySelectorAll('.md-story-dl-btn-inline');
        for (let b of storyBtns) {
            if (b.classList.contains('md-loading') || b.classList.contains('md-success')) {
                b.className = 'md-native-btn md-story-dl-btn-inline';
                if (typeof SVG_DOWNLOAD !== 'undefined') b.innerHTML = SVG_DOWNLOAD;
                b.style.opacity = '1';
                b.style.background = 'transparent';
            }
        }
    }
    window.__md_lastActiveStoryKey = currentStoryKey;

    let possibleDots = [];
    
    // CACHE LOGIC: Ultra-fast 60FPS check
    if (window.__md_cachedStoryDots && document.body.contains(window.__md_cachedStoryDots)) {
        let rect = window.__md_cachedStoryDots.getBoundingClientRect();
        let isHijacked = window.__md_cachedStoryDots.classList.contains('md-hijacked-dots');
        
        let centerX = window.innerWidth / 2;
        let distanceToCenter = Math.abs((rect.left + rect.width / 2) - centerX);

        // Invalidate cache if the story slide is moved off-screen (inactive carousel item)
        // A visible element will always be within innerWidth/2 of the center
        if (distanceToCenter < window.innerWidth / 2 && ((rect.width > 0 && rect.height > 0) || isHijacked)) {
            possibleDots = [window.__md_cachedStoryDots];
        }
    }

    // HEAVY SCAN: Only runs if cache is invalid/empty, throttled to max once every 200ms
    if (possibleDots.length === 0) {
        if (window.__md_lastStoryButtonScan && Date.now() - window.__md_lastStoryButtonScan < 200) {
            return; // Wait for throttle
        }
        window.__md_lastStoryButtonScan = Date.now();
        window.__md_cachedStoryDots = null;

        // 1. Find by SVG icon (3 circles) - check story headers/sections first before searching whole DOM
        let containers = document.querySelectorAll('header, section, ._aa61, div[role="dialog"]');
        let svgs = [];
        if (containers.length > 0) {
            for (let c of containers) svgs.push(...c.querySelectorAll('svg'));
        }
        if (svgs.length === 0) {
            svgs = Array.from(document.querySelectorAll('svg'));
        }

        for (let b of svgs) {
            if (b.querySelectorAll('circle').length === 3) {
                let target = b.closest('button, [role="button"], div[role="button"]') || b;
                let rect = target.getBoundingClientRect();
                let isHijacked = target.classList.contains('md-hijacked-dots');
                let inStoryZone = (rect.width > 0 && rect.height > 0) || isHijacked;
                if (inStoryZone && !possibleDots.includes(target)) possibleDots.push(target);
            }
        }

        // 2. Find by aria-label - fallback if SVG changes, but limited to elements that actually have aria-labels to save performance
        let labeledBtns = document.querySelectorAll('button[aria-label], [role="button"][aria-label]');
        for (let b of labeledBtns) {
            let label = (b.getAttribute('aria-label') || '').toLowerCase();
            if (label === 'more' || label === 'más' || label === 'mas' || label.includes('opciones') || label.includes('options')) {
                let rect = b.getBoundingClientRect();
                let isHijacked = b.classList.contains('md-hijacked-dots');
                let inStoryZone = (rect.width > 0 && rect.height > 0) || isHijacked;
                if (inStoryZone && !possibleDots.includes(b)) possibleDots.push(b);
            }
        }

        // Sort by proximity to screen center so the active story slide header is always selected over background feed posts
        possibleDots.sort((a, b) => {
            let aR = a.getBoundingClientRect(), bR = b.getBoundingClientRect();
            return Math.abs((aR.left + aR.width / 2) - (window.innerWidth / 2)) - Math.abs((bR.left + bR.width / 2) - (window.innerWidth / 2));
        });
    }

    let dotsBtn = possibleDots.length > 0 ? possibleDots[0] : null;
    if (dotsBtn) {
        window.__md_cachedStoryDots = dotsBtn;
        
        if (!dotsBtn.classList.contains('md-hijacked-dots')) {
            dotsBtn.classList.add('md-hijacked-dots');
        }

        let header = dotsBtn.closest('header, section, ._aa61') || dotsBtn.parentNode;

        let existingBtn = dotsBtn.previousElementSibling;
        if (existingBtn && existingBtn.classList.contains('md-story-dl-btn-inline')) {
            if (typeof syncStoryButtonState === 'function') syncStoryButtonState(existingBtn);
            return;
        }

        let orphanedBtn = header.querySelector('.md-story-dl-btn-inline');
        if (orphanedBtn) {
            dotsBtn.parentNode.insertBefore(orphanedBtn, dotsBtn);
            if (typeof syncStoryButtonState === 'function') syncStoryButtonState(orphanedBtn);
            return;
        }

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

        dlBtn.style.pointerEvents = 'auto'; // Ensure it's clickable even if parent isn't
        dlBtn.style.zIndex = '9999'; // Ensure it's on top
        
        dotsBtn.parentNode.insertBefore(dlBtn, dotsBtn);
        if (typeof syncStoryButtonState === 'function') syncStoryButtonState(dlBtn);

            dlBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();

                try {
                    if (window.MDToastManager) window.MDToastManager.showInfo("Starting download...");
                    dlBtn.style.background = 'rgba(255, 255, 255, 0.3)'; // Visual feedback immediately
                    dlBtn.classList.add('md-loading');
                    dlBtn.style.opacity = '0.5';

                    let clickStoryKey = (typeof getStoryKey === 'function') ? getStoryKey() : window.location.pathname;
                    document.body.__md_download_state = {
                        time: Date.now(),
                        class: 'md-loading',
                        html: SVG_DOWNLOAD,
                        isFloating: true,
                        storyKey: clickStoryKey
                    };

                    let check = { detected: false };
                    try {
                        check = detectSharedReelOrPost();
                    } catch (err) {
                        console.error("detectSharedReelOrPost error:", err);
                    }

                    if (check && check.detected) {
                        showSharedReelWarning(check);
                        dlBtn.classList.remove('md-loading');
                        dlBtn.style.opacity = '1';
                        dlBtn.style.background = 'transparent';
                        if (document.body.__md_download_state && document.body.__md_download_state.storyKey === clickStoryKey) {
                            delete document.body.__md_download_state;
                        }
                        return;
                    }

                    let currentUrl = window.location.href;
                    let storyIdMatch = currentUrl.match(/\/stories\/[^\/]+\/(\d+)/);
                    let bestUrl = null;
                    let bestMetadata = {};
                    let media = null;

                    if (storyIdMatch && window.__md_storyMediaDict && window.__md_storyMediaDict[storyIdMatch[1]]) {
                        // Shallow clone the dictionary object to avoid mutating the global cache!
                        bestMetadata = Object.assign({}, window.__md_storyMediaDict[storyIdMatch[1]]);
                        bestUrl = bestMetadata.url;
                    }

                let parent = dlBtn.parentElement;
                let climbs = 0;
                while (parent && parent !== document.body && climbs < 12) {
                    let medias = Array.from(parent.querySelectorAll('video, img')).filter(el => {
                        let r = el.getBoundingClientRect();
                        return r.width > 150 && r.height > 150 && r.right > 0 && r.left < window.innerWidth;
                    });
                    if (medias.length > 0) {
                        media = medias.find(m => m.tagName === 'VIDEO') || medias[0];
                        break;
                    }
                    parent = parent.parentElement;
                    climbs++;
                }

                if (!media) {
                    let mediaElements = Array.from(document.querySelectorAll('video, img'));
                    let validMedia = mediaElements.filter(el => {
                        let rect = el.getBoundingClientRect();
                        return rect.width > 200 && rect.height > 200 &&
                               rect.right > 0 && rect.left < window.innerWidth &&
                               Math.abs((rect.left + rect.width/2) - (window.innerWidth/2)) < 450;
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
                    if (validMedia.length > 0) media = validMedia[0];
                }

                if (!bestUrl && media) {
                    bestUrl = media.src || media.currentSrc;
                    if (media.tagName === 'VIDEO' && (!bestUrl || bestUrl === '')) {
                        let srcTag = media.querySelector('source');
                        if (srcTag) bestUrl = srcTag.src;
                    }
                }

                let needsFiber = false;
                if (media && media.tagName === 'VIDEO') {
                    if (!bestMetadata.dash_manifest) needsFiber = true;
                    if (!bestMetadata.username || bestMetadata.username === "") needsFiber = true;
                    if (!bestMetadata.timestamp || Math.abs((Date.now()/1000) - bestMetadata.timestamp) < 86400) needsFiber = true;
                }

                if (needsFiber) {
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
                        if (res.username && res.username.length > 0) { bestMetadata.username = res.username; }
                        if (res.timestamp) { bestMetadata.timestamp = res.timestamp; }
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
                    bestMetadata.media_category = "story";
                    sendDownloadRequest(dlBtn, bestUrl || window.location.href, bestMetadata, true);
                } else {
                    console.error("Media Downloader: Could not find media URL.");
                    dlBtn.classList.remove('md-loading');
                    dlBtn.style.opacity = '1';
                    dlBtn.style.background = 'transparent';
                    if (document.body.__md_download_state && document.body.__md_download_state.storyKey === clickStoryKey) {
                        delete document.body.__md_download_state;
                    }
                }
                } catch (err) {
                    console.error("Story Download Error:", err);
                    dlBtn.classList.remove('md-loading');
                    dlBtn.style.opacity = '1';
                    dlBtn.style.background = 'transparent';
                    if (document.body.__md_download_state && document.body.__md_download_state.storyKey === clickStoryKey) {
                        delete document.body.__md_download_state;
                    }
                    if (window.MDToastManager) window.MDToastManager.showError("Err: " + (err.message || err.toString()));
                }
            };
    }
}

window.injectStoryButton = injectStoryButton;
