export function getActiveStoryMedias() {
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

export function syncStoryProgressBar() {
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
        } else if (window.__md_cachedSegmentsContainer) {
            window.__md_cachedSegmentsContainer = null;
            window.__md_lastHeavySearch = 0; // Force an immediate structural scan without 250ms delay to eliminate visual stutter
        }

        if (possibleSegmentRows.length === 0) {
            if (!window.__md_lastHeavySearch || Date.now() - window.__md_lastHeavySearch > 250) {
                window.__md_lastHeavySearch = Date.now();
                
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

                // Instant universal structural detection at frame 0
                if (possibleSegmentRows.length === 0) {
                    let container = document.querySelector('section, div[role="dialog"], main, ._aa61') || document.body;
                    let candidateDivs = container.querySelectorAll('div');
                    for (let d of candidateDivs) {
                        if (d.children.length === 0 || d.children.length > 150) continue;
                        if (isValidSegmentRow(d) && !possibleSegmentRows.includes(d)) {
                            possibleSegmentRows.push(d);
                        }
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

                let startDrag = (e) => { 
                    slider.__md_isDragging = true;
                    e.stopPropagation(); 
                };
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

                if (!window.__md_storyGlobalListenersAttached) {
                    window.__md_storyGlobalListenersAttached = true;
                    const globalEndDrag = () => {
                        let activeSlider = document.querySelector('#md-story-slider');
                        if (activeSlider) activeSlider.__md_isDragging = false;
                    };
                    window.addEventListener('mouseup', globalEndDrag, false);
                    window.addEventListener('pointerup', globalEndDrag, false);
                    window.addEventListener('touchend', globalEndDrag, false);
                }

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
                                // Relaxed: We accept any animation inside the segments container
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

            function measureSegment(seg) {
                let parentRect = seg.getBoundingClientRect();
                if (parentRect.width === 0) return 0;
                let minPct = 100;
                let nodes = [seg, ...Array.from(seg.querySelectorAll('div'))];
                for (let n of nodes) {
                    let nRect = n.getBoundingClientRect();
                    if (nRect.height > 0 && nRect.height <= 15 && nRect.width <= parentRect.width + 2) {
                        let overlapLeft = Math.max(nRect.left, parentRect.left);
                        let overlapRight = Math.min(nRect.right, parentRect.right);
                        let visibleWidth = Math.max(0, overlapRight - overlapLeft);
                        let pct = Math.max(0, Math.min(100, (visibleWidth / parentRect.width) * 100));
                        if (pct < minPct) minPct = pct;
                    }
                }
                return minPct;
            }

            let lastIdx = window.__md_lastKnownSegmentIndex || 1;
            let found = false;

            // Fast path: Check last known segment first to avoid measuring all segments at 60FPS
            if (lastIdx >= 1 && lastIdx <= segmentElements.length) {
                let val = measureSegment(segmentElements[lastIdx - 1]);
                if (val >= 0.5 && val < 99.5) {
                    activeIndex = lastIdx;
                    activePct = val;
                    found = true;
                } else if (val >= 99.5 && lastIdx < segmentElements.length) {
                    let nextVal = measureSegment(segmentElements[lastIdx]);
                    if (nextVal < 99.5) {
                        activeIndex = lastIdx + 1;
                        activePct = nextVal;
                        found = true;
                    }
                }
            }

            // Fallback: Full scan on transition or initial load
            if (!found) {
                for (let i = 0; i < segmentElements.length; i++) {
                    let val = measureSegment(segmentElements[i]);
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
            }

            window.__md_lastKnownSegmentIndex = activeIndex;

            if (activeIndex > totalSegments) activeIndex = totalSegments;
            if (activeIndex === 0) activeIndex = 1;

            window.__md_activeStorySegment = segmentElements[activeIndex - 1] || null;

            let counter = customContainer.querySelector('#md-story-counter');
            if (counter && counter.textContent !== `${activeIndex}/${totalSegments}`) {
                counter.textContent = `${activeIndex}/${totalSegments}`;
            }

            let slider = customContainer.querySelector('#md-story-slider');
            
            // Only update read-only state and medias array periodically to avoid layout thrashing (60fps stutter)
            let now = Date.now();
            if (!slider.__md_lastMediaCheck || now - slider.__md_lastMediaCheck > 250 || slider.__md_lastSegmentIndex !== activeIndex) {
                slider.__md_lastMediaCheck = now;
                slider.__md_lastSegmentIndex = activeIndex;
                slider.__md_cachedMedias = getActiveStoryMedias();
                slider.__md_isPhotoOnly = slider.__md_cachedMedias.length === 0;
            }

            if (slider && !slider.__md_isDragging) {
                let pct = activePct;
                let medias = slider.__md_cachedMedias || [];
                for (let m of medias) {
                    if (!isNaN(m.duration) && m.duration > 0) {
                        pct = (m.currentTime / m.duration) * 100;
                    }
                    if (m.tagName.toLowerCase() === 'video') break;
                }

                // Smoothly boost the visual percentage by 1.5% so it reaches 100% naturally right as Instagram pauses at ~98.5%
                let visualPct = pct * 1.015;
                if (visualPct > 100) visualPct = 100;

                slider.value = visualPct;
                slider.style.setProperty('--md-progress', `${visualPct}%`);
            }
        }
    } catch (err) {
        console.error("Media Downloader syncStoryProgressBar error:", err);
    }
}

