import { syncStoryProgressBar } from './story.js';
import { syncModalScrollLock } from './utils.js';

let mdLastUrl = window.location.href;
let mdSuspendUntil = 0;

export function syncOverlays() {
        let openDialog = document.querySelector('div[role="dialog"]');

        // Execute Story Progress & Modal Lock instantly on every animation frame (never suspended by URL changes)
        syncModalScrollLock(openDialog);
        syncStoryProgressBar();

        if (window.location.href !== mdLastUrl) {
            let oldUrl = mdLastUrl;
            mdLastUrl = window.location.href;
            
            // Only suspend floating overlay buttons when switching across major Instagram page types (NOT when switching stories)
            let wasStory = oldUrl.includes('/stories/');
            let isStory = window.location.href.includes('/stories/');
            if (!(wasStory && isStory)) {
                mdSuspendUntil = Date.now() + 500;
                let overlayRoot = document.getElementById('md-overlay-root');
                if (overlayRoot) overlayRoot.style.display = 'none';
            }
        }
        
        if (Date.now() < mdSuspendUntil) {
            requestAnimationFrame(syncOverlays);
            return;
        } else {
            let overlayRoot = document.getElementById('md-overlay-root');
            if (overlayRoot && overlayRoot.style.display === 'none') overlayRoot.style.display = 'block';
        }

        // --- Sync PFP Button ---
        let pfp = document.querySelector('header img[alt*="profile picture"], header img[alt*="foto de perfil"]');
        let pfpBtn = document.getElementById('md-pfp-dl');
        if (pfpBtn) {
            let isStoryOpen = window.location.pathname.includes('/stories/');

            if (!isStoryOpen && !openDialog && pfp && document.body.contains(pfp)) {
                let rect = pfp.getBoundingClientRect();
                if (rect.width > 0) {
                    pfpBtn.style.display = 'flex';
                    pfpBtn.style.left = (rect.right + window.scrollX - 45) + 'px';
                    pfpBtn.style.top = (rect.bottom + window.scrollY - 45) + 'px';
                } else {
                    pfpBtn.style.display = 'none';
                }
            } else {
                pfpBtn.style.display = 'none';
            }
        }

        // --- Sync Download Buttons ---
        if (window.__md_activeDlButtons) {
            let candidates = [];

            for (let item of Array.from(window.__md_activeDlButtons)) {
                let wrapper = item.wrapper;
                let clone = item.clone;

                if (!document.body.contains(wrapper)) {
                    if (clone && clone.parentNode) clone.remove();
                    window.__md_activeDlButtons.delete(item);
                    continue;
                }

                let rect = wrapper.getBoundingClientRect();
                let inViewport = rect.width > 0 && rect.height > 0 &&
                    rect.top >= -1000 && rect.bottom <= window.innerHeight + 1000 &&
                    rect.left >= -1000 && rect.right <= window.innerWidth + 1000;

                if (inViewport) {
                    candidates.push({ item, clone, rect });
                } else {
                    clone.style.display = 'none';
                }
            }

            // If a dialog is open, only show buttons inside the dialog and hide background feed buttons
            if (openDialog) {
                candidates = candidates.filter(c => {
                    let inside = openDialog.contains(c.item.wrapper);
                    if (!inside) c.clone.style.display = 'none';
                    return inside;
                });
            }

            for (let { item, clone, rect } of candidates) {
                let wrapper = item.wrapper;
                let baseW = wrapper.offsetWidth || rect.width;
                let baseH = wrapper.offsetHeight || rect.height;
                let cx = rect.left + rect.width / 2;
                let cy = rect.top + rect.height / 2;
                let uLeft = cx - baseW / 2;
                let uTop = cy - baseH / 2;

                clone.style.display = 'flex';
                clone.style.alignItems = 'center';
                clone.style.justifyContent = 'center';
                clone.style.width = baseW + 'px';
                clone.style.height = baseH + 'px';
                clone.style.opacity = '1';
                clone.style.pointerEvents = 'auto';

                if (item.isVertical) {
                    // Arriba del bookmark para Reels (formato vertical)
                    clone.style.left = (uLeft + window.scrollX) + 'px';
                    clone.style.top = (uTop - baseH - 16 + window.scrollY) + 'px';
                } else {
                    // A la izquierda del bookmark para el Feed (formato horizontal)
                    clone.style.left = (uLeft - baseW - item.gapX + window.scrollX) + 'px';
                    clone.style.top = (uTop + window.scrollY) + 'px';
                }
            }
        }

        // --- Sync Video Progress Bars ---
        try {
            let isStoryOpenMode = window.location.pathname.includes('/stories/');
            let overlayRoot = document.getElementById('md-overlay-root');

            if (!window.__md_videoSliders) window.__md_videoSliders = new WeakMap();
            if (!window.__md_activeSliders) window.__md_activeSliders = new Set();

            if (!isStoryOpenMode && overlayRoot) {
                let videos = Array.from(document.querySelectorAll('video'));

                for (let c of Array.from(window.__md_activeSliders)) {
                    let stillExists = videos.includes(c.videoElement);
                    if (!stillExists) {
                        if (c.container && c.container.parentNode) c.container.remove();
                        window.__md_activeSliders.delete(c);
                    }
                }

                for (let v of videos) {
                    let rect = v.getBoundingClientRect();

                    // Calculate visible rect by intersecting with clipping ancestors
                    let visibleRect = {
                        left: rect.left,
                        top: rect.top,
                        right: rect.right,
                        bottom: rect.bottom,
                        width: rect.width,
                        height: rect.height
                    };

                    if (!v.__md_clip_parent_calculated) {
                        let parent = v.parentElement;
                        let clipParent = null;
                        let bRadL = '0px', bRadR = '0px';
                        try {
                            let vStyle = window.getComputedStyle(v);
                            if (parseFloat(vStyle.borderBottomLeftRadius) > 0) bRadL = vStyle.borderBottomLeftRadius;
                            if (parseFloat(vStyle.borderBottomRightRadius) > 0) bRadR = vStyle.borderBottomRightRadius;
                        } catch(e) {}

                        while(parent && parent !== document.body && parent !== document.documentElement) {
                            try {
                                let style = window.getComputedStyle(parent);
                                if (style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden' || style.clipPath !== 'none') {
                                    clipParent = parent;
                                    if (parseFloat(style.borderBottomLeftRadius) > 0) bRadL = style.borderBottomLeftRadius;
                                    if (parseFloat(style.borderBottomRightRadius) > 0) bRadR = style.borderBottomRightRadius;
                                    break;
                                }
                            } catch(e) {}
                            parent = parent.parentElement;
                        }
                        v.__md_clip_parent = clipParent;
                        v.__md_bRadL = bRadL;
                        v.__md_bRadR = bRadR;
                        v.__md_clip_parent_calculated = true;
                    }

                    if (v.__md_clip_parent) {
                        let pRect = v.__md_clip_parent.getBoundingClientRect();
                        visibleRect.left = Math.max(visibleRect.left, pRect.left);
                        visibleRect.top = Math.max(visibleRect.top, pRect.top);
                        visibleRect.right = Math.min(visibleRect.right, pRect.right);
                        visibleRect.bottom = Math.min(visibleRect.bottom, pRect.bottom);
                        visibleRect.width = visibleRect.right - visibleRect.left;
                        visibleRect.height = visibleRect.bottom - visibleRect.top;
                    }

                    // isOnScreen prevents ghost bars from hidden carousel slides.
                    let isOnScreen = visibleRect.width > 0 && visibleRect.height > 0 && visibleRect.right > 0 && visibleRect.left < window.innerWidth && visibleRect.top < window.innerHeight && visibleRect.bottom > 0;
                    if (openDialog && !openDialog.contains(v)) isOnScreen = false;

                    if (isOnScreen && v.duration > 0 && visibleRect.width > 300 && visibleRect.height > 300 && rect.width > 0) {

                        let customContainer = window.__md_videoSliders.get(v);

                        if (!customContainer) {
                            customContainer = document.createElement('div');
                            customContainer.className = 'md-video-progress-container';

                            let slider = document.createElement('input');
                            slider.type = 'range';
                            slider.className = 'md-video-slider';
                            slider.min = '0';
                            slider.max = '100';
                            slider.step = '0.1';
                            slider.value = '0';
                            slider.tabIndex = -1; // Prevent browser focus teleportation

                            customContainer.appendChild(slider);
                            overlayRoot.appendChild(customContainer);

                            window.__md_videoSliders.set(v, customContainer);
                            window.__md_activeSliders.add({ videoElement: v, container: customContainer });

                            customContainer.style.pointerEvents = 'none';

                            const stopEvt = (e) => e.stopPropagation();
                            slider.addEventListener('mousedown', stopEvt, false);
                            slider.addEventListener('pointerdown', stopEvt, false);
                            slider.addEventListener('pointermove', stopEvt, false);
                            slider.addEventListener('touchstart', stopEvt, {passive: false, capture: false});
                            slider.addEventListener('touchmove', stopEvt, {passive: false, capture: false});
                            slider.addEventListener('click', stopEvt, false);
                            slider.addEventListener('focus', (e) => e.target.blur(), false);

                            slider.addEventListener('input', (e) => {
                                let pct = parseFloat(e.target.value);
                                e.target.style.setProperty('--md-vid-progress', `${pct}%`);
                                if (!isNaN(v.duration)) {
                                    v.currentTime = (pct / 100) * v.duration;
                                }
                            });
                        }

                        if (customContainer && customContainer.parentNode !== overlayRoot) {
                            overlayRoot.appendChild(customContainer);
                        }

                        if (customContainer && customContainer.parentNode === overlayRoot) {
                            let isVisuallyHidden = false;
                            let checkNode = v;
                            while (checkNode && checkNode !== document.body) {
                                let s = window.getComputedStyle(checkNode);
                                if (s.opacity === '0' || s.visibility === 'hidden' || s.display === 'none') {
                                    isVisuallyHidden = true; break;
                                }
                                checkNode = checkNode.parentElement;
                            }

                            let isCarouselInactive = false;
                            if (window.__md_activeDlButtons) {
                                for (let item of window.__md_activeDlButtons) {
                                    if (item.badge && item.wrapper) {
                                        let mRect = item.wrapper.getBoundingClientRect();
                                        if (mRect.width > 0) {
                                            let activeMedia = null;
                                            let mediaNodes = Array.from(item.wrapper.querySelectorAll('img, video')).filter(m => m.getBoundingClientRect().width > 200);
                                            let mCenter = mRect.left + mRect.width / 2;
                                            let minCenterDist = Infinity;
                                            for (let media of mediaNodes) {
                                                let r = media.getBoundingClientRect();
                                                if (r.width > 0) {
                                                    let isH = false;
                                                    let cNode = media;
                                                    while (cNode && cNode !== document.body) {
                                                        let s = window.getComputedStyle(cNode);
                                                        if (s.opacity === '0' || s.visibility === 'hidden') { isH = true; break; }
                                                        cNode = cNode.parentElement;
                                                    }
                                                    if (isH) continue;
                                                    let center = r.left + r.width / 2;
                                                    let dist = Math.abs(center - mCenter);
                                                    if (dist < minCenterDist) { minCenterDist = dist; activeMedia = media; }
                                                }
                                            }
                                            if (activeMedia) item.__md_activeMedia = activeMedia;
                                        }
                                        if (item.wrapper.contains(v)) {
                                            if (item.__md_activeMedia && item.__md_activeMedia !== v) isCarouselInactive = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            if (isCarouselInactive) isVisuallyHidden = true;

                            let actualWidth = rect.width;
                            let actualHeight = rect.height;
                            let actualLeft = rect.left;
                            let actualTop = rect.top;

                            if (v.videoWidth && v.videoHeight) {
                                try {
                                    let style = window.getComputedStyle(v);
                                    let fit = style.objectFit;
                                    // HTML5 videos natively letterbox (act like contain) unless forced to 'cover'
                                    if (fit !== 'cover') {
                                        let vRatio = v.videoWidth / v.videoHeight;
                                        let cRatio = rect.width / rect.height;
                                        if (Math.abs(vRatio - cRatio) > 0.02) {
                                            if (vRatio > cRatio) {
                                                actualHeight = rect.width / vRatio;
                                                actualTop = rect.top + (rect.height - actualHeight) / 2;
                                            } else {
                                                actualWidth = rect.height * vRatio;
                                                actualLeft = rect.left + (rect.width - actualWidth) / 2;
                                            }
                                        }
                                    }
                                } catch(e) {}
                            }

                            let CCTop = actualTop + actualHeight - 16;
                            let CCBottom = CCTop + 16;
                            let CCLeft = actualLeft;
                            let CCRight = actualLeft + actualWidth;

                            let clipTop = Math.max(0, visibleRect.top - CCTop);
                            let clipBottom = Math.max(0, CCBottom - visibleRect.bottom);
                            let clipLeft = Math.max(0, visibleRect.left - CCLeft);
                            let clipRight = Math.max(0, CCRight - visibleRect.right);

                            let displayVal = 'block';
                            let clipVal = 'none';

                            if (isVisuallyHidden || clipLeft + clipRight >= actualWidth || clipTop + clipBottom >= 16 || visibleRect.width <= 0 || visibleRect.height <= 0) {
                                displayVal = 'none';
                            } else {
                                clipVal = `inset(${clipTop}px ${clipRight}px ${clipBottom}px ${clipLeft}px)`;
                            }

                            if (customContainer.__md_lastDisplay !== displayVal) {
                                customContainer.style.display = displayVal;
                                customContainer.__md_lastDisplay = displayVal;
                            }

                            if (displayVal === 'block') {
                                if (customContainer.__md_lastClip !== clipVal) {
                                    customContainer.style.clipPath = clipVal;
                                    customContainer.__md_lastClip = clipVal;
                                }

                                let widthVal = actualWidth + 'px';
                                if (customContainer.__md_lastWidth !== widthVal) {
                                    customContainer.style.width = widthVal;
                                    customContainer.__md_lastWidth = widthVal;
                                }

                                let transformVal = `translate3d(${actualLeft + window.scrollX}px, ${CCTop + window.scrollY}px, 0)`;
                                if (customContainer.__md_lastTransform !== transformVal) {
                                    customContainer.style.transform = transformVal;
                                    customContainer.__md_lastTransform = transformVal;
                                }

                                let bRadL = v.__md_bRadL || '0px';
                                if (customContainer.__md_lastBRadL !== bRadL) {
                                    customContainer.style.borderBottomLeftRadius = bRadL;
                                    customContainer.__md_lastBRadL = bRadL;
                                }

                                let bRadR = v.__md_bRadR || '0px';
                                if (customContainer.__md_lastBRadR !== bRadR) {
                                    customContainer.style.borderBottomRightRadius = bRadR;
                                    customContainer.__md_lastBRadR = bRadR;
                                }

                                let slider = customContainer.querySelector('input');
                                if (slider && !slider.__md_isDragging) {
                                    let pct = (v.currentTime / v.duration) * 100;
                                    let roundedPct = Math.round(pct * 10) / 10;
                                    if (slider.__md_lastPct !== roundedPct) {
                                        slider.value = roundedPct;
                                        slider.style.setProperty('--md-vid-progress', `${roundedPct}%`);
                                        slider.__md_lastPct = roundedPct;
                                    }
                                }
                            }
                        }
                    } else {
                        let customContainer = window.__md_videoSliders.get(v);
                        if (customContainer) {
                            if (customContainer.__md_lastDisplay !== 'none') {
                                customContainer.style.display = 'none';
                                customContainer.__md_lastDisplay = 'none';
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Progress bar sync error:", err);
        }

        requestAnimationFrame(syncOverlays);

}
