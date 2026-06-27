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
        clone.title = "Download Media";
        clone.style.cursor = 'pointer';
        clone.style.pointerEvents = 'auto';

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

        window.__md_dlButtons.set(wrapper, clone);
        window.__md_activeDlButtons.add({ wrapper: wrapper, clone: clone, isVertical: isVertical, gapX: applyGapX, gapY: applyGapY });

        // Reset download button instantly when carousel slide changes
        if (parentArticle && !parentArticle.__md_carouselReset) {
            parentArticle.__md_carouselReset = true;
            parentArticle.addEventListener('click', (evt) => {
                let target = evt.target.closest('button, [role="button"]');
                if (!target) return;
                let label = (target.getAttribute('aria-label') || '').toLowerCase();
                let isArrow = ['next', 'go forward', 'siguiente', 'go back', 'volver', 'zurück', 'suivant', 'précédent', 'anterior'].some(k => label.includes(k));
                let isDot = target.closest('[role="tablist"]') || target.getAttribute('role') === 'tab';
                if (isArrow || isDot) {
                    let dlBtn = parentArticle.querySelector('.md-post-btn');
                    if (dlBtn) {
                        dlBtn.classList.remove('md-success', 'md-loading', 'md-error', 'md-skipped');
                        let sv = dlBtn.querySelector('svg');
                        if (sv) {
                            let tmp = document.createElement('div');
                            tmp.innerHTML = SVG_DOWNLOAD;
                            let fresh = tmp.querySelector('svg');
                            if (sv.hasAttribute('class')) fresh.setAttribute('class', sv.getAttribute('class'));
                            if (sv.hasAttribute('color')) fresh.setAttribute('color', sv.getAttribute('color'));
                            fresh.setAttribute('fill', 'none');
                            fresh.setAttribute('stroke-width', '2');
                            sv.replaceWith(fresh);
                        }
                    }
                }
            }, true);
        }

        clone.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            let btnSvg = clone.querySelector('svg');
            if(btnSvg) btnSvg.style.opacity = '0.5';

            let article = svg.closest('article, main, div[role="dialog"]');

            if (!article) {
                let parent = svg.parentElement;
                while (parent && parent !== document.body) {
                    let hasLargeMedia = Array.from(parent.querySelectorAll('video, img')).some(el => {
                        let r = el.getBoundingClientRect();
                        return r.width > 200 && r.height > 200;
                    });
                    if (hasLargeMedia) {
                        article = parent;
                        break;
                    }
                    parent = parent.parentElement;
                }
            }

            let media = null;
            if (article) {
                let mediaElements = Array.from(article.querySelectorAll('video, img'));

                let validMedia = mediaElements.filter(el => {
                    let rect = el.getBoundingClientRect();
                    if (rect.width < 200 || rect.height < 200) return false;

                    let isVisible = true;
                    let curr = el;
                    while (curr && curr !== article && curr !== document.body) {
                        let st = window.getComputedStyle(curr);
                        if (st.opacity === '0' || st.visibility === 'hidden' || st.display === 'none') {
                            isVisible = false;
                            break;
                        }
                        curr = curr.parentElement;
                    }
                    if (!isVisible) return false;

                    let centerX = rect.left + (rect.width / 2);
                    let centerY = rect.top + (rect.height / 2);

                    if (centerX < 0) centerX = 10;
                    if (centerX > window.innerWidth) centerX = window.innerWidth - 10;
                    if (centerY < 0) centerY = 10;
                    if (centerY > window.innerHeight) centerY = window.innerHeight - 10;

                    let elementsAtCenter = document.elementsFromPoint(centerX, centerY);
                    if (!elementsAtCenter || !elementsAtCenter.includes(el)) {
                        return false;
                    }

                    return true;
                }).sort((a, b) => {
                    let aCenter = a.getBoundingClientRect().left + (a.getBoundingClientRect().width / 2);
                    let aTop = a.getBoundingClientRect().top + (a.getBoundingClientRect().height / 2);

                    let elementsAtPoint = document.elementsFromPoint(aCenter, aTop);
                    let aIndex = elementsAtPoint.indexOf(a);
                    let bIndex = elementsAtPoint.indexOf(b);

                    if (aIndex !== -1 && bIndex !== -1 && aIndex !== bIndex) {
                        return aIndex - bIndex;
                    }
                    if (aIndex !== -1 && bIndex === -1) return -1;
                    if (bIndex !== -1 && aIndex === -1) return 1;

                    if (a.tagName === 'VIDEO' && b.tagName !== 'VIDEO') return -1;
                    if (b.tagName === 'VIDEO' && a.tagName !== 'VIDEO') return 1;

                    let aArea = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
                    let bArea = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
                    return bArea - aArea;
                });

                media = validMedia[0] || mediaElements[0];
            }

            setTimeout(() => { if(btnSvg) btnSvg.style.opacity = '1'; }, 2000);

            if (media) {
                let { bestUrl, bestMetadata } = await resolveMediaUrl(media, article);
                if (bestUrl) {
                    sendDownloadRequest(clone, bestUrl, bestMetadata, true, svg);
                }
            }
        };
    });
}
