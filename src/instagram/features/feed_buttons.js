/* Media Downloader - Feed Buttons: Injects download button next to the Bookmark in feed/reels */

function injectFeedButtons() {
    if (!document.body) return;

    let overlayRoot = getOverlayRoot();

    // Posts/Reels: Inject next to Bookmark button
    let bookmarkSvgs = [];
    document.querySelectorAll('svg').forEach(s => {
        let label = (s.getAttribute('aria-label') || '').toLowerCase();
        // Incluir "remove" / "eliminar" por si el usuario ya tiene el post guardado
        if (['save', 'guardar', 'salvar', 'enregistrer', 'speichern', 'remove', 'eliminar'].includes(label)) {
            if (s.closest('button, [role="button"]')) {
                bookmarkSvgs.push(s);
            }
        } else if (s.querySelector('polygon[points*="20 21 12 13.44 4 21"]') || s.querySelector('path[d*="m20 21-8-7.56L4 21"]')) {
            if (s.closest('button, [role="button"]')) {
                bookmarkSvgs.push(s);
            }
        }
    });

    bookmarkSvgs.forEach((svg, index) => {
        if (svg.__md_processed) return;
        // CRITICAL: Never process SVGs that are inside our own overlay root (the clone's bookmark icon)
        if (svg.closest('#md-overlay-root')) return;
        svg.__md_processed = true;

        let wrapper = svg.closest('button, [role="button"]') || svg.parentElement;

        // Ensure we don't duplicate via tracking map
        if (window.__md_dlButtons && window.__md_dlButtons.has(wrapper)) return;

        let clone = wrapper.cloneNode(true);
        clone.classList.add('md-post-btn');
        if (wrapper.closest('div[role="dialog"]')) {
            clone.classList.add('md-in-dialog');
        }
        clone.title = "Download Media";
        clone.style.cursor = 'pointer';
        clone.style.pointerEvents = 'auto';
        clone.tabIndex = -1; // Prevent scroll-to-focus jumps during scroll
        clone.removeAttribute('autofocus');
        if (clone.tagName === 'BUTTON' || clone.getAttribute('role') === 'button') {
            clone.addEventListener('focus', (e) => e.target.blur(), false);
        }

        // Find and replace the inner SVG
        let innerSvg = clone.querySelector('svg');
        if (innerSvg) {
            let tempDiv = document.createElement('div');
            tempDiv.innerHTML = SVG_DOWNLOAD;
            let newSvg = tempDiv.querySelector('svg');
            if (innerSvg.hasAttribute('class')) newSvg.setAttribute('class', innerSvg.getAttribute('class'));
            if (innerSvg.hasAttribute('color')) newSvg.setAttribute('color', innerSvg.getAttribute('color'));
            newSvg.setAttribute('fill', 'none');
            newSvg.setAttribute('stroke-width', '2');
            innerSvg.replaceWith(newSvg);
        }

        let parentArticle = wrapper.closest('article, main, div[role="dialog"]');

        // Restore state if React destroyed the button mid-animation
        if (parentArticle && parentArticle.__md_download_state && !parentArticle.__md_download_state.isFloating) {
            let state = parentArticle.__md_download_state;
            let elapsed = Date.now() - state.time;
            if (elapsed < 2000 || state.class === 'md-loading') {
                clone.classList.add(state.class);

                let oldSvg = clone.querySelector('svg');
                if (oldSvg) {
                    let tmp = document.createElement('div');
                    tmp.innerHTML = state.html;
                    let freshSvg = tmp.querySelector('svg');
                    if (freshSvg) {
                        if (oldSvg.hasAttribute('class')) freshSvg.setAttribute('class', oldSvg.getAttribute('class'));
                        if (oldSvg.hasAttribute('color')) freshSvg.setAttribute('color', oldSvg.getAttribute('color'));
                        freshSvg.setAttribute('fill', 'none');
                        freshSvg.setAttribute('stroke-width', '2');
                        oldSvg.replaceWith(freshSvg);
                    }
                }
            } else {
                delete parentArticle.__md_download_state;
            }
        }

        // Detect native layout orientation
        let isVertical = false;
        let targetVisualGapX = 16; // Standard IG horizontal spacing between SVGs
        let targetVisualGapY = 24; // Standard IG vertical spacing

        let container = wrapper;
        let likeBtn = null;
        let commentBtn = null;

        // Walk up to find the closest action bar for THIS specific post (max 8 levels, stop at MAIN to avoid cross-post bleed)
        for (let i = 0; i < 8; i++) {
            if (!container || container.tagName === 'MAIN' || container === document.body) break;

            let likes = Array.from(container.querySelectorAll('svg[aria-label="Like"], svg[aria-label="Me gusta"]'));
            let comments = Array.from(container.querySelectorAll('svg[aria-label="Comment"], svg[aria-label="Comentar"]'));

            if (likes.length > 0 && comments.length > 0) {
                likeBtn = likes[0].closest('button, [role="button"]');
                commentBtn = comments[0].closest('button, [role="button"]');
                break;
            }
            container = container.parentElement;
        }

        if (likeBtn && commentBtn) {
            let r1 = likeBtn.getBoundingClientRect();
            let r2 = commentBtn.getBoundingClientRect();
            isVertical = Math.abs(r1.top - r2.top) > Math.abs(r1.left - r2.left);
        } else {
            // Fallback if action bar not found
            isVertical = window.location.pathname.includes('/reel/') || window.location.pathname.includes('/reels/');
        }

        // Calculate exact margin needed by subtracting the native padding/margins the clone will inherently provide
        let wRect = wrapper.getBoundingClientRect();
        let wSvg = wrapper.querySelector('svg');
        let builtInVisualGapX = 0;
        let builtInVisualGapY = 0;

        let wStyle = window.getComputedStyle(wrapper);
        let wMarLeft = parseFloat(wStyle.marginLeft) || 0;
        let wMarTop = parseFloat(wStyle.marginTop) || 0;

        if (wSvg) {
            let svgRect = wSvg.getBoundingClientRect();
            builtInVisualGapX = wRect.width - svgRect.width + wMarLeft;
            builtInVisualGapY = wRect.height - svgRect.height + wMarTop;
        } else {
            builtInVisualGapX = wRect.width * 0.4;
            builtInVisualGapY = wRect.height * 0.4;
        }

        let applyGapX = Math.max(0, targetVisualGapX - builtInVisualGapX);
        let applyGapY = Math.max(0, targetVisualGapY - builtInVisualGapY);

        // ABSOLUTE POSITIONING FIX: Do not mutate React's container AT ALL.
        // Mutating the container causes Invariant Violations when scrolling in Reels.
        clone.style.position = 'absolute';
        clone.style.zIndex = '2147483647';
        clone.style.margin = '0';
        overlayRoot.appendChild(clone);

        // Carousel Indicator Logic
        let carouselBadge = null;
        let carouselContainer = null;
        if (parentArticle) {
            let carouselUl = parentArticle.querySelector('ul');
            if (carouselUl && carouselUl.children.length > 1) {
                let clipParent = carouselUl.parentElement;
                while (clipParent && clipParent !== document.body) {
                    try {
                        let style = window.getComputedStyle(clipParent);
                        if (style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden' || style.clipPath !== 'none') {
                            break;
                        }
                    } catch(e) {}
                    clipParent = clipParent.parentElement;
                }
                carouselContainer = clipParent || carouselUl.parentElement;
                
                carouselBadge = document.createElement('div');
                carouselBadge.style.position = 'absolute';
                carouselBadge.style.background = 'rgba(0, 0, 0, 0.6)';
                carouselBadge.style.color = '#fff';
                carouselBadge.style.padding = '4px 10px';
                carouselBadge.style.borderRadius = '14px';
                carouselBadge.style.fontSize = '12px';
                carouselBadge.style.fontWeight = '500';
                carouselBadge.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
                carouselBadge.style.zIndex = '100';
                carouselBadge.style.pointerEvents = 'none';
                carouselBadge.style.backdropFilter = 'blur(4px)';
                carouselBadge.style.display = 'none'; // hidden initially
                
                overlayRoot.appendChild(carouselBadge);

                let lis = Array.from(carouselUl.children);
                let total = lis.length;
                carouselBadge.textContent = `1/${total}`; // Default, will be overridden by video_progress.js syncOverlays
            }
        }

        window.__md_dlButtons.set(wrapper, clone);
        window.__md_activeDlButtons.add({ 
            wrapper: wrapper, 
            clone: clone, 
            isVertical: isVertical, 
            gapX: applyGapX, 
            gapY: applyGapY,
            badge: carouselBadge,
            carouselContainer: carouselContainer
        });

        // Reset download button instantly when carousel slide changes (or any interaction)
        if (!window.__md_globalResetBound) {
            window.__md_globalResetBound = true;
            
            const globalResetBtn = (evt) => {
                let targetArticle = evt.target.closest('article, main, div[role="dialog"]');
                if (!targetArticle) return;
                
                delete targetArticle.__md_download_state;
                if (window.__md_activeDlButtons) {
                    window.__md_activeDlButtons.forEach(btnObj => {
                        if (!btnObj.wrapper || !btnObj.clone) return;
                        let btnParent = btnObj.wrapper.closest('article, main, div[role="dialog"]');
                        if (btnParent === targetArticle) {
                            let dlBtn = btnObj.clone;
                            let hadState = dlBtn.classList.contains('md-success') || dlBtn.classList.contains('md-loading') || dlBtn.classList.contains('md-error') || dlBtn.classList.contains('md-skipped');
                            if (hadState) {
                                dlBtn.classList.remove('md-success', 'md-loading', 'md-error', 'md-skipped');
                                let sv = dlBtn.querySelector('svg');
                                if (sv) {
                                    let tmp = document.createElement('div');
                                    tmp.innerHTML = typeof SVG_DOWNLOAD !== 'undefined' ? SVG_DOWNLOAD : '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
                                    let fresh = tmp.querySelector('svg');
                                    if (fresh) {
                                        if (sv.hasAttribute('class')) fresh.setAttribute('class', sv.getAttribute('class'));
                                        if (sv.hasAttribute('color')) fresh.setAttribute('color', sv.getAttribute('color'));
                                        fresh.setAttribute('fill', 'none');
                                        fresh.setAttribute('stroke-width', '2');
                                        fresh.setAttribute('stroke', 'currentColor');
                                        fresh.setAttribute('stroke-linecap', 'round');
                                        fresh.setAttribute('stroke-linejoin', 'round');
                                        sv.replaceWith(fresh);
                                    }
                                }
                            }
                        }
                    });
                }
            };
            
            document.addEventListener('pointerdown', globalResetBtn, true);
        }

        clone.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            let isShiftKey = e.shiftKey;
            
            let btnSvg = clone.querySelector('svg');
            if(btnSvg) btnSvg.style.opacity = '0.5';

            let openDialog = document.querySelector('div[role="dialog"]');

            // ===================================================================
            // FAST PATH: Modal / Profile Grid Dialog
            // When a dialog is open, Instagram's video is lazy (no <video> in DOM
            // until user plays it). We bypass DOM entirely and go straight to the
            // intercepted media dictionary using the shortcode from the modal URL
            // or from the closest <a> link inside the dialog.
            // ===================================================================
            if (openDialog) {
                let shortcode = null;
                let imgIndex = 1; // 1-based carousel index

                // 1. Try current URL (/p/CODE or /reel/CODE)
                let urlMatch = window.location.pathname.match(/\/(?:p|reel)\/([a-zA-Z0-9_-]+)/);
                if (urlMatch) shortcode = urlMatch[1];

                // 2. Check img_index query param (carousel navigation updates this)
                let imgIndexMatch = window.location.search.match(/img_index=(\d+)/);
                if (imgIndexMatch) imgIndex = parseInt(imgIndexMatch[1]);

                // 3. Try links inside the dialog as shortcode fallback
                if (!shortcode) {
                    let dialogLinks = Array.from(openDialog.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
                    for (let a of dialogLinks) {
                        let m = a.href.match(/\/(?:p|reel)\/([a-zA-Z0-9_-]+)/);
                        if (m) { shortcode = m[1]; break; }
                    }
                }

                console.log('[MD Debug] Dialog | shortcode:', shortcode, '| img_index:', imgIndex, '| dict size:', window.__md_storyMediaDict ? Object.keys(window.__md_storyMediaDict).length : 0);

                // For carousel slide 1 only: use dictionary (it stores the first image with the parent shortcode).
                // For slides 2+: the dictionary entries for those slides use numeric IDs, not the parent shortcode,
                // so we skip straight to DOM/Fiber which finds the actual visible slide in the DOM.
                let useDictionary = imgIndex === 1 && shortcode && window.__md_storyMediaDict;
                
                let uls = Array.from(openDialog.querySelectorAll('ul'));
                let isDialogCarousel = uls.length > 0 && uls[0].querySelectorAll('li').length > 1;

                if (isDialogCarousel && shortcode && isShiftKey) {
                    // USER PREFERENCE: Delegate entire carousel to gallery-dl!
                    console.log('[MD Debug] Delegating Dialog Carousel to gallery-dl');
                    let postUrl = `https://www.instagram.com/p/${shortcode}/`;
                    let bestMetadata = {
                        shortcode: shortcode,
                        media_category: 'post',
                        mediaType: 'auto' // Forces host.py to use gallery-dl natively
                    };
                    if(btnSvg) btnSvg.style.opacity = '1';
                    sendDownloadRequest(clone, postUrl, bestMetadata, true, wrapper);
                    return;
                }

                if (useDictionary) {
                    let allItems = Object.values(window.__md_storyMediaDict);
                    let matching = allItems.filter(m => m.shortcode === shortcode || m.code === shortcode);

                    if (matching.length > 0) {
                        let targetItem = matching[0];
                        let bestUrl = targetItem.url || null;
                        let bestMetadata = {
                            shortcode: targetItem.shortcode || targetItem.code || shortcode,
                            username: targetItem.username || null,
                            timestamp: targetItem.timestamp || null,
                            dash_manifest: targetItem.dash_manifest || null,
                            is_video: !!(targetItem.dash_manifest || (bestUrl && bestUrl.includes('.mp4'))),
                            media_id: targetItem.media_id || null,
                            media_category: 'post'
                        };
                        if (bestUrl) bestMetadata.url = bestUrl;

                        console.log('[MD Debug] Dictionary hit | url:', bestUrl ? bestUrl.slice(0, 60) : 'none', '| dash:', !!bestMetadata.dash_manifest);

                        if (bestUrl || bestMetadata.dash_manifest) {
                            if(btnSvg) btnSvg.style.opacity = '1';
                            if (typeof imgIndex !== 'undefined' && imgIndex > 0) bestMetadata.index = imgIndex;
                            sendDownloadRequest(clone, bestUrl, bestMetadata, true, wrapper);
                            return;
                        }
                    }
                }

                // For carousel slides 2+ (or dictionary miss): find the currently visible
                // img/video inside the dialog DOM and use Fiber to get the real media URL.
                // The carousel slide being viewed IS rendered in the DOM as an img/video element.
                console.log('[MD Debug] Using DOM/Fiber for slide', imgIndex);

                let dialogArticle = wrapper.closest('article') || openDialog;
                let fallbackMedia = null;
                let dialogMediaEls = Array.from(openDialog.querySelectorAll('video, img'));
                let validDialogMedia = dialogMediaEls.map(el => {
                    let rect = el.getBoundingClientRect();
                    let top = Math.max(0, rect.top);
                    let left = Math.max(0, rect.left);
                    let bottom = Math.min(window.innerHeight, rect.bottom);
                    let right = Math.min(window.innerWidth, rect.right);
                    let isVisible = true;
                    let curr = el;
                    while (curr && curr !== openDialog && curr !== document.body) {
                        let st = window.getComputedStyle(curr);
                        if (st.opacity === '0' || st.visibility === 'hidden' || st.display === 'none') { isVisible = false; break; }
                        if (st.overflow === 'hidden' || st.overflowX === 'hidden' || st.overflowY === 'hidden' || st.clipPath !== 'none') {
                            let pRect = curr.getBoundingClientRect();
                            top = Math.max(top, pRect.top); left = Math.max(left, pRect.left);
                            bottom = Math.min(bottom, pRect.bottom); right = Math.min(right, pRect.right);
                        }
                        curr = curr.parentElement;
                    }
                    let width = Math.max(0, right - left);
                    let height = Math.max(0, bottom - top);
                    let visibleArea = isVisible ? (width * height) : 0;
                    return { el, visibleArea };
                }).filter(item => item.visibleArea > 10000).sort((a, b) => b.visibleArea - a.visibleArea);
                
                if (validDialogMedia.length > 0) {
                    fallbackMedia = validDialogMedia[0].el;
                }

                console.log('[MD Debug] Fiber target:', fallbackMedia?.tagName, fallbackMedia?.src?.slice(0, 60));

                if (fallbackMedia) {
                    let { bestUrl, bestMetadata } = await resolveMediaUrl(fallbackMedia, dialogArticle, shortcode, imgIndex);
                    if (bestUrl || (bestMetadata && bestMetadata.dash_manifest)) {
                        if(btnSvg) btnSvg.style.opacity = '1';
                        if (typeof imgIndex !== 'undefined' && imgIndex > 0) bestMetadata.index = imgIndex;
                        sendDownloadRequest(clone, bestUrl, bestMetadata, true, wrapper);
                    } else {
                        console.warn('[MD] Fiber returned nothing for modal slide', imgIndex, '| media:', fallbackMedia?.tagName);
                        if(btnSvg) btnSvg.style.opacity = '1';
                        if (window.MDToastManager) window.MDToastManager.showError("Error: Could not identify video (Modal).");
                    }
                } else {
                    console.warn('[MD] No visible media element found inside dialog for slide', imgIndex);
                    if(btnSvg) btnSvg.style.opacity = '1';
                }
                return;
            }

            // ===================================================================
            // STANDARD PATH: Feed / Reel / Explore (no open dialog)
            // ===================================================================
            let article = wrapper.closest('article, main') || document.body;
            if (article.tagName === 'MAIN' || article === document.body) {
                let parent = wrapper.parentElement;
                while (parent && parent !== document.body) {
                    let hasLargeMedia = Array.from(parent.querySelectorAll('video, img')).some(el => {
                        let r = el.getBoundingClientRect();
                        return r.width > 200 && r.height > 200;
                    });
                    if (hasLargeMedia) { article = parent; break; }
                    parent = parent.parentElement;
                }
                if (!article) article = document.body;
            }

            let idx = null;
            let media = null;
            let isCarousel = false;
            
            if (article) {
                let articleRect = article.getBoundingClientRect();
                let articleCenterX = articleRect.left + articleRect.width / 2;
                let uls = Array.from(article.querySelectorAll('ul'));
                isCarousel = uls.length > 0 && uls[0].querySelectorAll('li').length > 1;

                if (isCarousel) {
                    if (isShiftKey) {
                        console.log('[MD Debug] Delegating Feed Carousel to gallery-dl');
                        let timeLink = article.querySelector('a[href*="/p/"], a[href*="/reel/"]');
                        let shortcode = timeLink ? timeLink.href.match(/\/(?:p|reel)\/([a-zA-Z0-9_-]+)/)[1] : null;
                        
                        if (!shortcode) {
                            let m = window.location.pathname.match(/\/(?:p|reel)\/([a-zA-Z0-9_-]+)/);
                            if (m) shortcode = m[1];
                        }

                        if (shortcode) {
                            let postUrl = `https://www.instagram.com/p/${shortcode}/`;
                            let bestMetadata = {
                                shortcode: shortcode,
                                media_category: 'post',
                                mediaType: 'auto' // Forces host.py to use gallery-dl natively
                            };
                            
                            if(btnSvg) btnSvg.style.opacity = '1';
                            sendDownloadRequest(clone, postUrl, bestMetadata, true, svg);
                            return; // Bypass all Fiber and DOM selection
                        }
                    } else {
                        // Normal Click: Download EXACT slide natively
                        let ul = uls[0];
                        let lis = Array.from(ul.querySelectorAll('li'));
                        let bestLi = null;
                        let minDistance = Infinity;
                        
                        // 1. Find the `li` that is currently in the center of the article
                        for (let li of lis) {
                            let rect = li.getBoundingClientRect();
                            let liCenterX = rect.left + rect.width / 2;
                            let dist = Math.abs(liCenterX - articleCenterX);
                            if (dist < minDistance) {
                                minDistance = dist;
                                bestLi = li;
                            }
                        }
                        
                        // 2. Extract the media ONLY from inside that specific `li`
                        // This mathematically ignores ANY absolutely positioned stray video thumbnails
                        if (bestLi) {
                            let elements = Array.from(bestLi.querySelectorAll('video, img')).filter(el => {
                                let r = el.getBoundingClientRect();
                                return r.width > 150 && r.height > 150;
                            });
                            
                            let vid = elements.find(el => el.tagName.toLowerCase() === 'video');
                            if (vid) {
                                media = vid;
                            } else if (elements.length > 0) {
                                media = elements[0];
                            }
                            
                            let posInset = bestLi.getAttribute('aria-posinset');
                            if (posInset && !isNaN(parseInt(posInset, 10))) {
                                idx = parseInt(posInset, 10);
                            }
                        }

                        // Robust mathematical override: Scroll Position (The ultimate truth for large carousels)
                        // Instagram wraps the UL in a DIV that actually handles the scrolling. The UL itself is often 1px wide.
                        let scrollers = Array.from(article.querySelectorAll('div, ul')).filter(el => {
                            // Find the container that actually scrolls horizontally and is large enough to be the carousel
                            return el.scrollWidth > el.clientWidth && el.clientWidth > 150 && el.scrollWidth >= (el.clientWidth * 1.5);
                        });
                        
                        if (scrollers.length > 0) {
                            let scroller = scrollers[0]; // The outermost scrollable container
                            let slideWidth = scroller.clientWidth;
                            let scrollX = scroller.scrollLeft;
                            
                            if (scrollX === 0 && scroller.scrollLeft === 0) {
                                // Fallback for transform: translateX if they use an inner wrapper
                                let inner = scroller.querySelector('div');
                                if (inner) {
                                    let transform = window.getComputedStyle(inner).transform;
                                    if (transform && transform !== 'none') {
                                        let match = transform.match(/matrix\((.+)\)/);
                                        if (match) {
                                            let values = match[1].split(',').map(v => parseFloat(v.trim()));
                                            if (values.length === 6) scrollX = Math.abs(values[4]);
                                        }
                                    }
                                }
                            }
                            
                            if (slideWidth > 0 && scrollX >= 0) {
                                let calculatedIdx = Math.round(scrollX / slideWidth) + 1;
                                if (calculatedIdx > 0) {
                                    idx = calculatedIdx;
                                    console.log('[MD] Overrode carousel index via Scroll Position to:', idx);
                                }
                            }
                        }
                    }
                }
                
                if (!media) {
                    // Fallback for single posts
                    let mediaElements = Array.from(article.querySelectorAll('video, img'));
                    let validMedia = mediaElements.map(el => {
                        let rect = el.getBoundingClientRect();
                        let isVisible = true;
                        let curr = el;
                        while (curr && curr !== article && curr !== document.body) {
                            let st = window.getComputedStyle(curr);
                            if (st.opacity === '0' || st.visibility === 'hidden' || st.display === 'none') { isVisible = false; break; }
                            curr = curr.parentElement;
                        }
                        let visibleArea = isVisible ? (rect.width * rect.height) : 0;
                        return { el, visibleArea, isVideo: el.tagName === 'VIDEO' };
                    }).filter(item => item.visibleArea > 10000).sort((a, b) => {
                        let areaDiff = b.visibleArea - a.visibleArea;
                        if (Math.abs(areaDiff) > (Math.max(a.visibleArea, b.visibleArea) * 0.1)) {
                            return areaDiff;
                        }
                        if (a.isVideo && !b.isVideo) return -1;
                        if (b.isVideo && !a.isVideo) return 1;
                        return 0;
                    });
                    media = validMedia.length > 0 ? validMedia[0].el : mediaElements[0];
                }
            }

            setTimeout(() => { if(btnSvg) btnSvg.style.opacity = '1'; }, 2000);

            if (media) {
                // Attempt to get exact index from aria-posinset (flawless for virtualized lists)
                if (idx === null) {
                    let posInset = media.closest('[aria-posinset]');
                    if (posInset) {
                        let val = parseInt(posInset.getAttribute('aria-posinset'), 10);
                        if (!isNaN(val)) idx = val;
                    } else if (article) {
                        // Fallback for absolutely positioned videos (which are outside the list item)
                        let lis = Array.from(article.querySelectorAll('[aria-posinset]'));
                        if (lis.length > 0) {
                            let articleRect = article.getBoundingClientRect();
                            let articleCenter = articleRect.left + (articleRect.width / 2);
                            let bestLi = null;
                            let minDistance = Infinity;
                            
                            for (let li of lis) {
                                let rect = li.getBoundingClientRect();
                                let liCenter = rect.left + (rect.width / 2);
                                let distance = Math.abs(articleCenter - liCenter);
                                if (distance < minDistance) {
                                    minDistance = distance;
                                    bestLi = li;
                                }
                            }
                            if (bestLi) {
                                let val = parseInt(bestLi.getAttribute('aria-posinset'), 10);
                                if (!isNaN(val)) idx = val;
                            }
                        }
                    }
                }
                
                let { bestUrl, bestMetadata } = await resolveMediaUrl(media, article, null, idx);
                
                if (bestUrl || (bestMetadata && bestMetadata.dash_manifest)) {
                    if(btnSvg) btnSvg.style.opacity = '1';

                    if (isCarousel && bestMetadata && bestMetadata.index) {
                        // USER PREFERENCE: Force gallery-dl for single carousel slides!
                        console.log('[MD Debug] Delegating Single Carousel Slide to gallery-dl (Index: ' + bestMetadata.index + ')');
                        let postUrl = `https://www.instagram.com/p/${bestMetadata.shortcode}/`;
                        bestMetadata.mediaType = 'auto'; // Force gallery-dl in host.py
                        sendDownloadRequest(clone, postUrl, bestMetadata, true, svg);
                    } else {
                        // Single posts still use native download
                        sendDownloadRequest(clone, bestUrl, bestMetadata, true, svg);
                    }
                } else {
                    console.warn('[MD] resolveMediaUrl returned nothing for feed media.');
                    if(btnSvg) btnSvg.style.opacity = '1';
                    if (window.MDToastManager) window.MDToastManager.showError("Error: Could not resolve video URL.");
                }
            } else {
                console.warn('[MD] No media element found in article.');
                if(btnSvg) btnSvg.style.opacity = '1';
            }
        };
    });
}


