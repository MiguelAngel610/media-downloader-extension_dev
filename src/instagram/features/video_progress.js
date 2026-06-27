/* Media Downloader - Video Progress: rAF sync loop for all video progress bars and download buttons */

let mdLastUrl = window.location.href;
let mdSuspendUntil = 0;

function startSyncLoop() {
    if (window.__md_overlaySyncLoopStarted) return;
    window.__md_overlaySyncLoopStarted = true;

    function syncOverlays() {
        if (window.location.href !== mdLastUrl) {
            mdLastUrl = window.location.href;
            mdSuspendUntil = Date.now() + 1000;
            let overlayRoot = document.getElementById('md-overlay-root');
            if (overlayRoot) overlayRoot.style.display = 'none';
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
            let openDialog = document.querySelector('div[role="dialog"]');

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

        // --- Sync Continuous Story Progress Bar ---
        try {
            let isStoryOpenMode = window.location.pathname.includes('/stories/');
            if (isStoryOpenMode) {
                let possibleSegmentRows = [];
                document.querySelectorAll('div[style*="width:"], div[style*="transform:"]').forEach(inner => {
                    let current = inner.parentElement;
                    let climbs = 0;
                    while (current && climbs < 4) {
                        let style = window.getComputedStyle(current);
                        if (style.display === 'flex' || style.display === 'grid') {
                            if (current.children.length > 0 && !possibleSegmentRows.includes(current)) {
                                possibleSegmentRows.push(current);
                            }
                            break;
                        }
                        current = current.parentElement;
                        climbs++;
                    }
                });

                let segmentsContainer = null;
                for (let row of possibleSegmentRows) {
                    let rect = row.getBoundingClientRect();
                    if (rect.width > 50 && rect.top >= -50 && rect.top < 200 && rect.height > 0 && rect.height < 50) {
                        segmentsContainer = row;
                        break;
                    }
                }

                if (segmentsContainer) {
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

                        let counter = document.createElement('div');
                        counter.id = 'md-story-counter';

                        customContainer.appendChild(slider);
                        customContainer.appendChild(counter);

                        if (window.getComputedStyle(segmentsContainer).position === 'static') {
                            segmentsContainer.style.position = 'relative';
                        }
                        segmentsContainer.appendChild(customContainer);

                        slider.addEventListener('mousedown', (e) => {
                            slider.__md_isDragging = true;
                            e.stopPropagation();
                        }, true);
                        slider.addEventListener('touchstart', (e) => {
                            slider.__md_isDragging = true;
                            e.stopPropagation();
                        }, {passive: false, capture: true});
                        slider.addEventListener('mouseup', () => slider.__md_isDragging = false);
                        slider.addEventListener('touchend', () => slider.__md_isDragging = false);
                        slider.addEventListener('click', (e) => e.stopPropagation(), true);

                        slider.addEventListener('input', (e) => {
                            let pct = parseFloat(e.target.value);
                            e.target.style.setProperty('--md-progress', `${pct}%`);
                            let videos = document.querySelectorAll('video');
                            for (let v of videos) {
                                let vr = v.getBoundingClientRect();
                                if (vr.width > 0 && vr.left >= -50 && vr.right <= window.innerWidth + 50) {
                                    if (!isNaN(v.duration) && v.duration > 0) {
                                        v.currentTime = (pct / 100) * v.duration;
                                    }
                                    break;
                                }
                            }
                        });

                        setTimeout(() => customContainer.classList.add('md-visible'), 50);
                    }

                    if (!segmentsContainer.classList.contains('md-hide-native-segments')) {
                        segmentsContainer.classList.add('md-hide-native-segments');
                    }

                    let totalSegments = segmentsContainer.children.length;
                    if (segmentsContainer.lastElementChild === customContainer) {
                        totalSegments = Math.max(1, totalSegments - 1);
                    }

                    let activeIndex = totalSegments;
                    let activePct = 0;

                    for (let i = 0; i < totalSegments; i++) {
                        let seg = segmentsContainer.children[i];
                        if (seg.id === 'md-story-progress-container') continue;

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

                    let counter = customContainer.querySelector('#md-story-counter');
                    if (counter && counter.textContent !== `${activeIndex}/${totalSegments}`) {
                        counter.textContent = `${activeIndex}/${totalSegments}`;
                    }

                    let slider = customContainer.querySelector('#md-story-slider');
                    if (slider && !slider.__md_isDragging) {
                        let pct = activePct;
                        let videos = document.querySelectorAll('video');
                        for (let v of videos) {
                            let vr = v.getBoundingClientRect();
                            if (vr.width > 0 && vr.left >= -50 && vr.right <= window.innerWidth + 50) {
                                if (!isNaN(v.duration) && v.duration > 0) {
                                    pct = (v.currentTime / v.duration) * 100;
                                }
                                break;
                            }
                        }
                        slider.value = pct;
                        slider.style.setProperty('--md-progress', `${pct}%`);
                    }
                }
            }
        } catch (err) {
            console.error("Media Downloader syncOverlays error:", err);
        }

        // --- Sync Download Buttons (Winner Takes All) ---
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

            // If a dialog is open, prefer candidates inside the dialog
            let openDialog = document.querySelector('div[role="dialog"]');
            if (openDialog) {
                candidates = candidates.filter(c => openDialog.contains(c.item.wrapper));
            }

            // Pick the single winner: bookmark closest to screen center
            let centerY = window.innerHeight / 2;
            let winner = null;
            let winnerDist = Infinity;
            for (let c of candidates) {
                let dist = Math.abs((c.rect.top + c.rect.height / 2) - centerY);
                if (dist < winnerDist) { winnerDist = dist; winner = c; }
            }

            for (let { item, clone, rect } of candidates) {
                if (item === winner.item) {
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
                    clone.style.transition = 'opacity 0.15s ease-out';

                    let lastUTop = parseFloat(clone.dataset.lastUTop);
                    let diff = Math.abs(uTop - lastUTop);

                    let isReels = window.location.pathname.includes('/reel/') || window.location.pathname.includes('/reels/');

                    if (isReels && !isNaN(lastUTop) && diff > 5) {
                        clone.style.opacity = '0';
                        clone.style.pointerEvents = 'none';
                    } else {
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
                    clone.dataset.lastUTop = uTop;
                } else {
                    clone.style.display = 'none';
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
                    let openDialog = document.querySelector('div[role="dialog"]');
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

                            customContainer.appendChild(slider);
                            overlayRoot.appendChild(customContainer);

                            window.__md_videoSliders.set(v, customContainer);
                            window.__md_activeSliders.add({ videoElement: v, container: customContainer });

                            customContainer.style.pointerEvents = 'none';

                            slider.addEventListener('mousedown', (e) => { e.stopPropagation(); }, true);
                            slider.addEventListener('click', (e) => { e.stopPropagation(); }, true);

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

                            if (clipLeft + clipRight >= actualWidth || clipTop + clipBottom >= 16 || visibleRect.width <= 0 || visibleRect.height <= 0) {
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
                        if (customContainer && customContainer.parentNode) {
                            customContainer.remove();
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
