/* Media Downloader for X - Download button injection */

/** Size ladder used by X's CDN; "orig" is the untouched upload (official gallery-dl twitter.size default). */
const X_IMAGE_SIZE_ORIGINAL = 'orig';

/**
 * Rewrites a pbs.twimg.com image URL to its original upload.
 * The format is preserved (a PNG stays PNG); the old code forced format=jpg, which re-encoded PNGs.
 * @param {string} src
 * @returns {string | null}
 */
function toOriginalQualityImageUrl(src) {
    let url;
    try {
        url = new URL(src);
    } catch (err) {
        console.warn('[MD X] Skipping image with invalid URL:', src, err);
        return null;
    }
    // Legacy URLs carry the format as a path extension (media/ID.png) instead of ?format=.
    if (!url.searchParams.has('format')) {
        const extMatch = url.pathname.match(/\.(jpe?g|png|webp|gif)$/i);
        if (extMatch) {
            url.pathname = url.pathname.slice(0, -extMatch[0].length);
            url.searchParams.set('format', extMatch[1].toLowerCase());
        }
    }
    url.searchParams.set('name', X_IMAGE_SIZE_ORIGINAL);
    return url.href;
}

// Download arrow SVG matching X's icon style (outline arrow + tray)
const downloadSvgPath ='M12 15.51l-5.7-5.7 1.41-1.42L11 11.59V2h2v9.59l3.3-3.3 1.41 1.42L12 15.51zM3 15v3.5c0 1.38 1.12 2.5 2.5 2.5h13c1.38 0 2.5-1.12 2.5-2.5V15h-2v3.5c0 .28-.22.5-.5.5h-13c-.28 0-.5-.22-.5-.5V15H3z';

function injectDownloadButtons() {
    // Inject into all tweet action groups (Timeline, Status Page, and Modal Bottom Bar)
    // We check for [role="group"] and then validate it by looking for the Reply button
    const actionGroups = document.querySelectorAll('[role="group"]');

    actionGroups.forEach(group => {
        // If our button is already here, React hasn't destroyed it, so skip.
        if (group.querySelector('.md-injected-x-wrapper')) return;

        const replyBtn = group.querySelector('[data-testid="reply"]');
        if (!replyBtn) return;

        // Extract tweet ID — search article first, then dialog, then URL
        const article = group.closest('article');
        const dialog = group.closest('[role="dialog"]');
        const searchContainer = article || dialog;
        let tweetId = null;
        let tweetDateStr = null;

        if (searchContainer) {
            for (const timeEl of searchContainer.querySelectorAll('time')) {
                const link = timeEl.closest('a');
                if (link && link.href) {
                    const m = link.href.match(/status\/(\d+)/);
                    if (m) { tweetId = m[1]; break; }
                }
            }
        }

        if (!tweetId) {
            const m = window.location.href.match(/status\/(\d+)/);
            if (m) tweetId = m[1];
        }

        if (!tweetId) return;

        // Calculate Tweet Date from Twitter's Snowflake ID using BigInt
        try {
            const snowflake = BigInt(tweetId);
            const timestamp = Number(snowflake >> 22n) + 1288834974657;
            const d = new Date(timestamp);
            const pad = (n) => String(n).padStart(2, "0");
            tweetDateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        } catch (e) {
            console.error("Failed to parse Snowflake ID:", e);
        }

        const shareBtn = group.querySelector('[aria-label="Share Tweet"], [aria-label="Share post"]') || group.querySelector('button[aria-label*="Share" i]');
        if (!shareBtn) return;
        
        const bookmarkBtn = group.querySelector('[data-testid="bookmark"]') || group.querySelector('[data-testid="removeBookmark"]');
        let referenceWrapper;
        let isBottomBar = false;

        // Helper function to find the exact flex child wrapper inside the [role="group"]
        const getGroupChild = (el) => {
            let current = el;
            while (current && current.parentElement && current.parentElement.getAttribute('role') !== 'group') {
                current = current.parentElement;
            }
            return current;
        };

        if (bookmarkBtn) {
            referenceWrapper = getGroupChild(bookmarkBtn);
        } else {
            // We are likely in the modal bottom bar (no bookmark button).
            // Let's use the Like button as the reference to clone.
            const likeBtn = group.querySelector('[data-testid="like"]') || group.querySelector('[data-testid="unlike"]');
            if (likeBtn) {
                referenceWrapper = getGroupChild(likeBtn);
                isBottomBar = true;
            }
        }

        if (!referenceWrapper) return;

        // Clone the reference wrapper completely to inherit all native flex, margins, and padding.
        const cloneWrapper = referenceWrapper.cloneNode(true);
        
        // Clean up the clone
        cloneWrapper.classList.remove('r-1wron08');
        cloneWrapper.classList.remove('r-13awgt0'); // If we cloned Like, it might have flex-grow:1
        cloneWrapper.classList.add('md-injected-x-wrapper');

        // DYNAMIC SPACING: Compact vs Expanded Layout
        const isDialog = group.closest('[role="dialog"]') !== null;
        
        // The main tweet on a status page has text and stretches (r-13awgt0).
        const isExpandedLayout = !isDialog && (referenceWrapper.classList.contains('r-13awgt0') || (bookmarkBtn && bookmarkBtn.textContent.trim().length > 0));
        
        if (isExpandedLayout) {
            // Status Page: Only left items are flexible.
            cloneWrapper.style.flexGrow = '0';
            cloneWrapper.style.flexBasis = 'auto';
            cloneWrapper.style.minWidth = '0';
            // 48px is the mathematically calculated sweet spot to balance the flexible items
            cloneWrapper.style.marginRight = '48px';
            cloneWrapper.style.marginLeft = '0px';
        } else {
            // Timeline & Modals: absolute perfect visual harmony across all buttons.
            const groupParent = referenceWrapper.parentElement;
            if (groupParent) {
                groupParent.style.justifyContent = 'space-between';
                
                Array.from(groupParent.children).forEach(child => {
                    child.classList.remove('r-13awgt0'); // Remove stretch from Reply/RT/Like/View
                    child.classList.remove('r-1wron08'); // Remove native push-to-right from Bookmark
                    child.style.flexGrow = '0';
                    child.style.minWidth = '0'; // Crucial for narrow modals to prevent overlapping text
                });
            }
            
            // Ensure our injected button is also a standard non-stretching item
            cloneWrapper.style.flexGrow = '0';
            cloneWrapper.style.flexBasis = 'auto';
            cloneWrapper.style.minWidth = '0';
            cloneWrapper.style.marginRight = '0px';
            cloneWrapper.style.marginLeft = '0px';
        }

        const clone = cloneWrapper.querySelector('button') || cloneWrapper;
        
        if (clone.setAttribute) {
            clone.setAttribute('aria-label', 'Download');
            clone.removeAttribute('data-testid');
            clone.classList.add('md-download-btn-x');
            clone.onclick = null;
        }

        // Replace the SVG with our download icon
        const svg = clone.querySelector('svg');
        const dirDiv = clone.querySelector('div[dir="ltr"]');
        if (svg) {
            svg.innerHTML = `<g><path d="${downloadSvgPath}"></path></g>`;
            
            // Remove the number counter (e.g., "67") if we are on a single tweet page
            const iconContainer = svg.closest('.r-xoduu5') || svg.parentElement;
            if (dirDiv && iconContainer) {
                Array.from(dirDiv.children).forEach(child => {
                    if (child !== iconContainer) child.remove();
                });
            }
        }

        // --- NATIVE DOM SIBLING STRATEGY ---
        if (bookmarkBtn) {
            // Insert exactly between Bookmark and Share. 
            referenceWrapper.insertAdjacentElement('afterend', cloneWrapper);
        } else {
            // Insert before Share in the bottom bar
            const shareGroupChild = getGroupChild(shareBtn);
            if (shareGroupChild) {
                shareGroupChild.insertAdjacentElement('beforebegin', cloneWrapper);
            } else {
                shareBtn.parentElement.insertAdjacentElement('beforebegin', cloneWrapper);
            }
        }

        // Custom hover effects (Blue circle and tooltip)
        const hoverOverlay = clone.querySelector('.r-1p0dtai') || clone.querySelector('.r-zchlnj');
        const iconContainer = clone.querySelector('svg').parentElement;
        
        // Create custom tooltip matching X native
        const tooltip = document.createElement('div');
        tooltip.textContent = 'Download';
        tooltip.style.cssText = `
            position: fixed;
            background-color: rgba(36, 45, 52, 1);
            color: rgb(255, 255, 255);
            font-size: 11px;
            font-weight: 700;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            padding: 4px 10px;
            border-radius: 9999px;
            pointer-events: none;
            opacity: 0;
            white-space: nowrap;
            z-index: 999999;
            transform: translateX(-50%);
            transition: opacity 0.1s ease-in-out;
        `;
        document.body.appendChild(tooltip);

        let tooltipTimeout;
        clone.addEventListener('mouseenter', () => {
            if (hoverOverlay) hoverOverlay.style.backgroundColor = isBottomBar ? 'rgba(255, 255, 255, 0.1)' : 'rgba(29, 155, 240, 0.1)';
            if (svg && !isBottomBar) svg.style.color = 'rgb(29, 155, 240)';
            
            // Native tooltips have a hover delay before appearing
            tooltipTimeout = setTimeout(() => {
                const rect = clone.getBoundingClientRect();
                tooltip.style.left = rect.left + (rect.width / 2) + 'px';
                // Push it down a bit more so it perfectly aligns with native X tooltips
                tooltip.style.top = rect.bottom + 8 + 'px';
                tooltip.style.opacity = '1';
            }, 700); // 700ms delay to match native X
        });
        
        clone.addEventListener('mouseleave', () => {
            if (hoverOverlay) hoverOverlay.style.backgroundColor = 'transparent';
            if (svg) svg.style.color = ''; // Reverts to native CSS inherited color (gray in timeline, white in bottom bar)
            clearTimeout(tooltipTimeout);
            tooltip.style.opacity = '0';
        });

        // Hide tooltip on click to avoid ghost tooltips
        clone.addEventListener('mousedown', () => {
            clearTimeout(tooltipTimeout);
            tooltip.style.opacity = '0';
        });

        // Click listener
        const clickTarget = clone;
        clickTarget.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Replicate the native click visual feedback
            const iconContainer = clone.querySelector('svg').parentElement;
            if (iconContainer) {
                iconContainer.style.transform = 'scale(0.8)';
                setTimeout(() => { iconContainer.style.transform = 'scale(1)'; }, 150);
            }

            // Walk up from the clicked button to find the article or dialog
            let tweetArticle = null;
            let dialog = null;
            let el = clickTarget;
            while (el && el !== document.body) {
                if (el.tagName === 'ARTICLE') tweetArticle = el;
                if (el.getAttribute('role') === 'dialog') dialog = el;
                el = el.parentElement;
            }

            const searchScope = dialog || tweetArticle || document;
            let foundMedia = false;

            // 1. Check for video in this scope
            const hasVideo = searchScope.querySelector('video') ||
                             searchScope.querySelector('[data-testid="videoPlayer"]') ||
                             searchScope.querySelector('[data-testid="videoPoster"]') ||
                             searchScope.querySelector('[data-testid="playButton"]');
            const hasVideoThumb = searchScope.querySelector('img[src*="ext_tw_video_thumb"]') ||
                                  searchScope.querySelector('img[src*="amplify_video_thumb"]');
            
            if (hasVideo || hasVideoThumb) {
                window.postMessage({ action: "GET_X_VIDEO", tweetId: tweetId, tweetDate: tweetDateStr }, "*");
                foundMedia = true;
                // No return here! We want to keep looking for images (mixed media support)
            }

            // 2. Find ALL valid images in this scope
            const allImgs = searchScope.querySelectorAll('img');
            const uniqueUrls = new Set();

            for (const img of allImgs) {
                let src = img.src || '';
                if (!src) continue;
                if (src.includes('profile_images')) continue;
                if (src.includes('emoji/v2')) continue;
                if (src.includes('card_img')) continue;
                if (src.includes('ext_tw_video_thumb')) continue; // Thumbnails for videos are ignored as photos
                if (src.includes('amplify_video_thumb')) continue;
                
                // Filter out tiny UI icons (if loaded)
                if (img.naturalWidth > 0 && (img.naturalWidth < 100 || img.naturalHeight < 100)) continue;

                const imgUrl = toOriginalQualityImageUrl(src);
                if (!imgUrl) continue;
                
                if (!uniqueUrls.has(imgUrl)) {
                    uniqueUrls.add(imgUrl);
                    window.postMessage({ action: "DOWNLOAD_X_IMAGE", url: imgUrl, tweetId: tweetId, tweetDate: tweetDateStr }, "*");
                    foundMedia = true;
                }
            }

            if (!foundMedia) {
                alert("No se encontró imagen ni video para descargar.");
            }
        });
    });
}
