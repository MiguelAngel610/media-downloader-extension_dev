/* Media Downloader - Video Progress: rAF sync loop for all video progress bars and download buttons */

let mdLastUrl = window.location.href;
let mdSuspendUntil = 0;

function syncModalScrollLock(openDialog) {
    if (openDialog || document.body.style.overflow === 'hidden' || document.body.style.overflow === 'clip') {
        if (document.documentElement.style.overflow !== 'hidden') {
            document.documentElement.style.overflow = 'hidden';
        }
    } else {
        if (document.documentElement.style.overflow === 'hidden') {
            document.documentElement.style.overflow = '';
        }
    }
}

function getActiveStoryMedias() {
    let result = [];
    let candidateBtn = null;
    let dlBtns = Array.from(document.querySelectorAll('.md-story-dl-btn-inline'));
    if (dlBtns.length > 0) {
        dlBtns.sort((a, b) => {
            let aR = a.getBoundingClientRect(), bR = b.getBoundingClientRect();
            return Math.abs((aR.left + aR.width / 2) - (window.innerWidth / 2)) - Math.abs((bR.left + bR.width / 2) - (window.innerWidth / 2));
        });
        candidateBtn = dlBtns[0];
    }
    if (!candidateBtn) {
        let allDots = Array.from(document.querySelectorAll('header svg, ._aa61 svg, section svg, svg')).filter(s => s.querySelectorAll('circle').length === 3);
        let possibleDots = [];
        for (let b of allDots) {
            let target = b.closest('button, [role="button"], div[role="button"]') || b;
            let rect = target.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.top >= -20 && rect.top <= 300 && Math.abs((rect.left + rect.width / 2) - (window.innerWidth / 2)) < 500) {
                possibleDots.push(target);
            }
        }
        if (possibleDots.length > 0) {
            possibleDots.sort((a, b) => {
                let aR = a.getBoundingClientRect(), bR = b.getBoundingClientRect();
                return Math.abs((aR.left + aR.width / 2) - (window.innerWidth / 2)) - Math.abs((bR.left + bR.width / 2) - (window.innerWidth / 2));
            });
            candidateBtn = possibleDots[0];
        }
    }

    if (candidateBtn) {
        let parent = candidateBtn.parentElement;
        let climbs = 0;
        while (parent && parent !== document.body && climbs < 12) {
            let visibleVisuals = Array.from(parent.querySelectorAll('video, img')).filter(el => {
                let r = el.getBoundingClientRect();
                let center = r.left + (r.width / 2);
                return r.width > 150 && r.height > 150 && r.right > 0 && r.left < window.innerWidth && Math.abs(center - window.innerWidth / 2) < 400;
            });
            if (visibleVisuals.length > 0) {
                let videos = visibleVisuals.filter(el => {
                    if (el.tagName.toLowerCase() !== 'video') return false;
                    if (el.ended) return false;
                    let style = window.getComputedStyle(el);
                    if (style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none') return false;
                    return true;
                });
                result.push(...videos);
                break;
            }
            parent = parent.parentElement;
            climbs++;
        }
    }

    document.querySelectorAll('audio').forEach(a => {
        if (!a.paused && !a.ended && !isNaN(a.duration) && a.duration > 0) {
            if (!result.includes(a)) result.push(a);
        }
    });
    return result;
}

function syncStoryProgressBar() {
    try {
        let isStoryOpenMode = window.location.pathname.includes('/stories/');
        if (!isStoryOpenMode) return;

        function isValidSegmentRow(row) {
            if (!row || !row.children) return false;
            let style = window.getComputedStyle(row);
            if (style.display !== 'flex' && style.display !== 'grid') return false;
            let rect = row.getBoundingClientRect();
            // True story segments rows are thin horizontal bars at the very top of the story card
            if (rect.width < 150 || rect.top < -30 || rect.top > 120 || rect.height === 0 || rect.height > 25) return false;
            let center = rect.left + (rect.width / 2);
            if (Math.abs(center - window.innerWidth / 2) >= 360) return false;

            let nativeChildren = Array.from(row.children).filter(c => c.id !== 'md-story-progress-container');
            if (nativeChildren.length === 0) return false;

            // Strict structural barrier: Instagram story segment bars NEVER contain buttons, icons/SVGs, profile images, or user text
            for (let ch of nativeChildren) {
                let tag = ch.tagName.toLowerCase();
                if (tag === 'svg' || tag === 'button' || tag === 'img' || tag === 'header' || tag === 'canvas') {
                    return false;
                }
                if (ch.querySelector('button, [role="button"], svg, img, header, canvas, .md-story-dl-btn-inline, .md-mini-btn')) {
                    return false;
                }
                let txt = ch.textContent ? ch.textContent.trim() : '';
                if (txt.length > 0 && !txt.match(/^\d+\/\d+$/)) {
                    return false;
                }
            }
            return true;
        }

        let possibleSegmentRows = [];
        if (window.__md_cachedSegmentsContainer && document.body.contains(window.__md_cachedSegmentsContainer)) {
            let rect = window.__md_cachedSegmentsContainer.getBoundingClientRect();
            if (rect.width > 0) {
                possibleSegmentRows = [window.__md_cachedSegmentsContainer];
            }
        }

        if (possibleSegmentRows.length === 0) {
            document.querySelectorAll('div[style*="width:"], div[style*="transform:"]').forEach(inner => {
                let current = inner.parentElement;
                let climbs = 0;
                while (current && climbs < 4) {
                    if (isValidSegmentRow(current) && !possibleSegmentRows.includes(current)) {
                        possibleSegmentRows.push(current);
                        break;
                    }
                    current = current.parentElement;
                    climbs++;
                }
            });

            // Instant universal structural detection at frame 0 (before Instagram applies inline width/transform animations during buffering or on static photo stories)
            if (possibleSegmentRows.length === 0) {
                let allDivs = document.querySelectorAll('div');
                for (let d of allDivs) {
                    if (d.children.length === 0 || d.children.length > 150) continue;
                    if (isValidSegmentRow(d) && !possibleSegmentRows.includes(d)) {
                        possibleSegmentRows.push(d);
                    }
                }
            }
        }

        possibleSegmentRows.sort((a, b) => {
            let aR = a.getBoundingClientRect(), bR = b.getBoundingClientRect();
            let aDist = Math.abs((aR.left + aR.width / 2) - (window.innerWidth / 2));
            let bDist = Math.abs((bR.left + bR.width / 2) - (window.innerWidth / 2));
            if (Math.abs(aDist - bDist) > 100) {
                return aDist - bDist; // Prioritize center story column
            }
            return aR.top - bR.top; // Within center column, the topmost bar is ALWAYS the true segment progress indicator!
        });

        let segmentsContainer = possibleSegmentRows[0] || null;
        if (segmentsContainer) {
            window.__md_cachedSegmentsContainer = segmentsContainer;
            let customContainer = segmentsContainer.querySelector('#md-story-progress-container');

            if (!customContainer) {
                document.querySelectorAll('#md-story-progress-container').forEach(e => e.remove());

                customContainer = document.createElement('div');
                customContainer.id = 'md-story-progress-container';

                let slider = document.createElement('input');
                slider.type = 'range';
                slider.id = 'md-story-slider';
                slider.min = '0';
                slider.max = '100';
                slider.step = '0.1';
                slider.value = '0';
                slider.tabIndex = -1;

                let counter = document.createElement('div');
                counter.id = 'md-story-counter';
                counter.textContent = '1/1'; // Prevent empty counter flash on initial render

                customContainer.appendChild(slider);
                customContainer.appendChild(counter);

                if (window.getComputedStyle(segmentsContainer).position === 'static') {
                    segmentsContainer.style.position = 'relative';
                }
                segmentsContainer.appendChild(customContainer);

                const startDrag = (e) => { slider.__md_isDragging = true; e.stopPropagation(); };
                slider.addEventListener('mousedown', startDrag, false);
                slider.addEventListener('pointerdown', startDrag, false);
                slider.addEventListener('touchstart', startDrag, {passive: false, capture: false});

                const stopMove = (e) => { e.stopPropagation(); };
                slider.addEventListener('pointermove', stopMove, false);
                slider.addEventListener('touchmove', stopMove, {passive: false, capture: false});

                const endDrag = () => { slider.__md_isDragging = false; };
                slider.addEventListener('mouseup', endDrag, false);
                slider.addEventListener('pointerup', endDrag, false);
                slider.addEventListener('touchend', endDrag, false);
                slider.addEventListener('pointercancel', endDrag, false);
                slider.addEventListener('touchcancel', endDrag, false);
                slider.addEventListener('change', endDrag, false);
                slider.addEventListener('blur', endDrag, false);
                window.addEventListener('mouseup', endDrag, false);
                window.addEventListener('pointerup', endDrag, false);
                window.addEventListener('touchend', endDrag, false);

                slider.addEventListener('click', (e) => e.stopPropagation(), false);
                slider.addEventListener('focus', (e) => e.target.blur(), false);

                slider.addEventListener('input', (e) => {
                    let pct = parseFloat(e.target.value);
                    e.target.style.setProperty('--md-progress', `${pct}%`);
                    let medias = getActiveStoryMedias();
                    for (let m of medias) {
                        if (!isNaN(m.duration) && m.duration > 0) {
                            m.currentTime = (pct / 100) * m.duration;
                        }
                    }
                    if (document.getAnimations) {
                        for (let anim of document.getAnimations()) {
                            let t = anim.effect ? anim.effect.target : null;
                            if (!t) continue;
                            let isSegmentAnim = customContainer.parentElement && customContainer.parentElement.contains(t);
                            if (isSegmentAnim) {
                                if (!window.__md_activeStorySegment || !window.__md_activeStorySegment.contains(t)) {
                                    continue;
                                }
                            } else {
                                if (!t.closest('section, div[role="dialog"], main, ._aa61')) continue;
                                let r = t.getBoundingClientRect ? t.getBoundingClientRect() : null;
                                if (!r || r.width === 0 || r.height === 0 || Math.abs((r.left + r.width / 2) - (window.innerWidth / 2)) >= 400) {
                                    continue;
                                }
                            }
                            let timing = anim.effect.getComputedTiming ? anim.effect.getComputedTiming() : (anim.effect.getTiming ? anim.effect.getTiming() : null);
                            let dur = timing ? timing.duration : null;
                            if (typeof dur === 'number' && !isNaN(dur) && dur > 0 && dur < 100000) {
                                if (!isSegmentAnim && (dur < 1500 || (anim.playState !== 'running' && anim.playState !== 'paused'))) {
                                    continue;
                                }
                                anim.currentTime = (pct / 100) * dur;
                                if (anim.playState === 'finished' && pct < 99) {
                                    try { anim.play(); } catch(e) {}
                                }
                            }
                        }
                    }
                });

                customContainer.classList.add('md-visible');
            }

            document.querySelectorAll('.md-hide-native-segments').forEach(el => {
                if (el !== segmentsContainer) el.classList.remove('md-hide-native-segments');
            });

            if (!segmentsContainer.classList.contains('md-hide-native-segments')) {
                segmentsContainer.classList.add('md-hide-native-segments');
            }

            let totalSegments = 0;
            let segmentElements = [];
            for (let ch of Array.from(segmentsContainer.children)) {
                if (ch.id !== 'md-story-progress-container') {
                    totalSegments++;
                    segmentElements.push(ch);
                }
            }
            if (totalSegments === 0) totalSegments = 1;

            let activeIndex = totalSegments;
            let activePct = 0;

            for (let i = 0; i < segmentElements.length; i++) {
                let seg = segmentElements[i];
                let parentRect = seg.getBoundingClientRect();
                if (parentRect.width === 0) continue;

                let minPct = 100;
                let nodes = [seg, ...Array.from(seg.querySelectorAll('div'))];
                for (let n of nodes) {
                    let nRect = n.getBoundingClientRect();
                    if (nRect.height > 0 && nRect.height <= 15 && nRect.width <= parentRect.width + 2) {
                        let overlapLeft = Math.max(nRect.left, parentRect.left);
                        let overlapRight = Math.min(nRect.right, parentRect.right);
                        let visibleWidth = Math.max(0, overlapRight - overlapLeft);

                        let pct = (visibleWidth / parentRect.width) * 100;
                        pct = Math.max(0, Math.min(100, pct));
                        if (pct < minPct) {
                            minPct = pct;
                        }
                    }
                }

                let val = minPct;
                if (val < 0.5) {
                    activeIndex = i + 1;
                    activePct = 0;
                    break;
                } else if (val < 99.5) {
                    activeIndex = i + 1;
                    activePct = val;
                    break;
                }
            }

            if (activeIndex > totalSegments) activeIndex = totalSegments;
            if (activeIndex === 0) activeIndex = 1;

            window.__md_activeStorySegment = segmentElements[activeIndex - 1] || null;

            let counter = customContainer.querySelector('#md-story-counter');
            if (counter && counter.textContent !== `${activeIndex}/${totalSegments}`) {
                counter.textContent = `${activeIndex}/${totalSegments}`;
            }

            let slider = customContainer.querySelector('#md-story-slider');
            if (slider && !slider.__md_isDragging) {
                let pct = activePct;
                let medias = getActiveStoryMedias();
                for (let m of medias) {
                    if (!isNaN(m.duration) && m.duration > 0) {
                        pct = (m.currentTime / m.duration) * 100;
                    }
                    if (m.tagName.toLowerCase() === 'video') break;
                }
                if (pct >= 96.5) pct = 100;
                if (pct <= 1.0 && pct > 0) pct = 0;
                slider.value = pct;
                slider.style.setProperty('--md-progress', `${pct}%`);
            }
        }
    } catch (err) {
        console.error("Media Downloader syncStoryProgressBar error:", err);
    }
}

function startSyncLoop() {
    if (window.__md_overlaySyncLoopStarted) return;
    window.__md_overlaySyncLoopStarted = true;

    function syncOverlays() {
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
    syncOverlays();
}
