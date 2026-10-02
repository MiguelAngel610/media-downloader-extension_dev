/* Media Downloader - Button State: Icon updates and download request dispatch */

function updateButtonIcon(btn, newSvgCode, isFloating) {
    if (isFloating) {
        btn.innerHTML = newSvgCode;
        return;
    }
    let oldSvg = btn.querySelector('svg');
    if (oldSvg) {
        let tmp = document.createElement('div');
        tmp.innerHTML = newSvgCode;
        let newSvg = tmp.querySelector('svg');
        if (newSvg) {
            if (oldSvg.hasAttribute('class')) newSvg.setAttribute('class', oldSvg.getAttribute('class'));
            if (oldSvg.hasAttribute('color')) newSvg.setAttribute('color', oldSvg.getAttribute('color'));
            newSvg.setAttribute('fill', 'none');
            newSvg.setAttribute('stroke-width', '2');
            oldSvg.replaceWith(newSvg);
        }
    }
}

function sendDownloadRequest(btn, url, metadata, isFloating = false, originalElement = null) {
    btn.classList.add('md-loading');

    let parentArticle = (originalElement || btn).closest('article, main, div[role="dialog"]');
    if (parentArticle) {
        parentArticle.__md_download_state = { time: Date.now(), class: 'md-loading', html: SVG_DOWNLOAD, isFloating: isFloating };
    }

    if (!metadata) metadata = {};

    // Patch missing username
    if (!metadata.username || metadata.username === "") {
        metadata.username = resolveUsername(btn, originalElement);
    }

    // If we have the exact media_id from ig_interceptor, use it to calculate the perfect shortcode ONLY if missing
    if (!metadata.shortcode && metadata.media_id) {
        metadata.shortcode = idToShortcode(String(metadata.media_id).split('_')[0]);
    }

    // Patch shortcode if missing, if it's a numeric ID, or if it's an unusually long hash (>15 chars)
    if (!metadata.shortcode || String(metadata.shortcode).match(/^\d+(_\d+)?$/) || String(metadata.shortcode).length > 15) {
        let foundShortcode = null;

        // 1. Try closest anchor (e.g. Grid thumbnails)
        let aTag = (originalElement || btn).closest('a');
        if (aTag && aTag.href) {
            let m1 = aTag.href.match(/\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)/);
            if (m1) {
                let s = m1[1];
                if (s.length > 15 && s.includes('-')) s = s.split('-')[0];
                foundShortcode = s;
            }
        }

        // 2. Try any anchor inside the post (e.g. Timestamp or Comments link)
        if (!foundShortcode) {
            let article = (originalElement || btn).closest('article, main, div[role="dialog"]');
            if (article) {
                let links = article.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]');
                for (let a of links) {
                    let m2 = a.href.match(/\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)/);
                    if (m2) {
                        let s = m2[1];
                        if (s.length > 15 && s.includes('-')) s = s.split('-')[0];
                        foundShortcode = s;
                        break;
                    }
                }
            }
        }

        // 3. Try address bar (Posts) - ONLY as a fallback if the button is on the main post itself
        if (!foundShortcode) {
            let m3 = window.location.href.match(/\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)/);
            if (m3) {
                let s = m3[1];
                if (s.length > 15 && s.includes('-')) s = s.split('-')[0];
                foundShortcode = s;
            }
        }

        // 4. Try address bar (Stories)
        if (!foundShortcode) {
            let m4 = window.location.href.match(/\/stories\/[^\/]+\/(\d+)/);
            if (m4) foundShortcode = idToShortcode(m4[1]);
        }

        if (foundShortcode) {
            metadata.shortcode = foundShortcode;
        } else if (String(metadata.shortcode).match(/^\d+(_\d+)?$/)) {
            metadata.shortcode = idToShortcode(String(metadata.shortcode).split('_')[0]);
        } else if (String(metadata.shortcode).length > 15) {
            metadata.shortcode = null;
        }
    }

    if (!metadata.timestamp) metadata.timestamp = Math.floor(Date.now() / 1000);

    // Patch timestamp using DOM <time> if it seems like a fallback (within last 1 min)
    if (Math.abs((Date.now()/1000) - metadata.timestamp) < 60) {
        let container = (originalElement || btn).closest('article, main, div[role="dialog"]');
        if (container) {
            let timeEl = container.querySelector('time[datetime]');
            if (timeEl) {
                let dtStr = timeEl.getAttribute('datetime');
                if (dtStr) {
                    metadata.timestamp = Math.floor(new Date(dtStr).getTime() / 1000);
                }
            }
        }
    }

    // Ensure we have a unique media_id to prevent carousel overwrites
    if (!metadata.media_id && url && url.startsWith('http')) {
        try {
            let urlFilename = url.split('?')[0].split('/').pop();
            if (urlFilename && urlFilename.includes('_')) {
                metadata.media_id = urlFilename.split('.')[0];
            }
        } catch (e) {}
    }

    if (!chrome.runtime || !chrome.runtime.id) {
        alert("La extensión fue actualizada. Por favor, recarga esta pestaña de Instagram para seguir descargando.");
        btn.classList.remove('md-loading');
        return;
    }

    chrome.storage.local.get(['selectedAccount'], function(result) {
        const account = result.selectedAccount || 'M';

        let finalUrl = url;
        let mediaType = "auto";

        if (getPlatform() === "instagram") {
            if (metadata && metadata.is_pfp_bot) {
                mediaType = "pfp_bot";
            } else if (url && url.startsWith('blob:') && (!metadata || !metadata.dash_manifest)) {
                let isStoryBtn = btn && (btn.id === 'md-story-dl-btn-inline');

                if (isStoryBtn || window.location.href.includes('/stories/')) {
                    let m = window.location.href.match(/\/stories\/([^\/]+)\/(\d+)/);
                    if (m) {
                        finalUrl = window.location.href;
                    } else if (metadata.username && metadata.media_id) {
                        finalUrl = "https://www.instagram.com/stories/" + metadata.username + "/" + String(metadata.media_id).split('_')[0] + "/";
                    } else if (metadata.username) {
                        finalUrl = "https://www.instagram.com/stories/" + metadata.username + "/";
                    }
                } else if (metadata.shortcode) {
                    finalUrl = "https://www.instagram.com/p/" + metadata.shortcode + "/";
                } else {
                    let m = window.location.href.match(/\/(?:p|reel)\/([a-zA-Z0-9_-]+)/);
                    if (m) finalUrl = "https://www.instagram.com/p/" + m[1] + "/";
                }

                if (finalUrl.startsWith('blob:')) {
                    console.error("Media Downloader: Cannot resolve original URL for blob.");
                    btn.classList.remove('md-loading');
                    btn.classList.add('md-error');
                    if (parentArticle) parentArticle.__md_download_state = { time: Date.now(), class: 'md-error', html: SVG_DOWNLOAD, isFloating: isFloating };

                    setTimeout(() => {
                        btn.classList.remove('md-error');
                        updateButtonIcon(btn, SVG_DOWNLOAD, isFloating);
                        if (parentArticle) delete parentArticle.__md_download_state;
                    }, 2000);
                    return; // abort
                }

                mediaType = "auto";
            } else {
                // We have a direct CDN url (or a dash manifest). We can download natively!
                mediaType = metadata && metadata.mediaType ? metadata.mediaType : "direct_story";
            }
        }

        if (!metadata.media_category) {
            metadata.media_category = "post";
        }
        
        if (window.MDToastManager) {
            window.MDToastManager.showInfo("⏳ Starting download...");
        }

        chrome.runtime.sendMessage({
            action: "queue_download",
            url: finalUrl,
            mediaType: mediaType,
            platform: getPlatform(),
            account: account,
            direct_metadata: metadata
        }, (response) => {
            btn.classList.remove('md-loading');

            btn.classList.add('md-success');
            updateButtonIcon(btn, SVG_CHECK, isFloating);

            if (parentArticle) parentArticle.__md_download_state = { time: Date.now(), class: 'md-success', html: SVG_CHECK, isFloating: isFloating };

            setTimeout(() => {
                btn.classList.remove('md-success');
                updateButtonIcon(btn, SVG_DOWNLOAD, isFloating);
                if (parentArticle) delete parentArticle.__md_download_state;
            }, 2000);
        });
    });
}
