/* Media Downloader - Username Resolver: Extracts username from DOM, URL, or meta tags */

export function resolveUsername(btn, originalElement) {
    let username = "Unknown";
    let urlMatch = window.location.href.match(/(?:instagram\.com\/)([a-zA-Z0-9_.-]+)/);
    let storyMatch = window.location.href.match(/\/stories\/([a-zA-Z0-9_.-]+)\//);

    if (storyMatch) {
        username = storyMatch[1];
    } else if (urlMatch && !['p', 'reel', 'stories', 'explore', 'direct'].includes(urlMatch[1])) {
        username = urlMatch[1];
    } else {
        // Priority 1: Document title or meta tags (perfect for dedicated post pages)
        let foundInMeta = false;
        let mTitle = document.title.match(/@([a-zA-Z0-9_.-]+)/);
        if (!mTitle) {
            let ogDesc = document.querySelector('meta[property="og:description"]');
            if (ogDesc) mTitle = ogDesc.content.match(/@([a-zA-Z0-9_.-]+)/);
        }
        if (!mTitle) {
            let ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) mTitle = ogTitle.content.match(/@([a-zA-Z0-9_.-]+)/);
        }

        if (mTitle) {
            username = mTitle[1];
            foundInMeta = true;
        }

        // We only trust the page title/meta username if we are actually ON a dedicated post page
        if (foundInMeta && !window.location.pathname.includes('/p/') && !window.location.pathname.includes('/reel/') && !window.location.pathname.includes('/reels/')) {
            username = "Unknown"; // Revert if we are on a feed page
        }

        if (username === "Unknown") {
            let container = (originalElement || btn).closest('article, main, div[role="dialog"]');
            if (container) {
                // Priority 2: Profile picture link
                let pfpImg = container.querySelector('img[alt*="profile"], img[alt*="perfil"], img[alt*="pic"]');
                if (pfpImg) {
                    let aTag = pfpImg.closest('a');
                    if (aTag) {
                        let match = aTag.getAttribute('href').match(/^\/([a-zA-Z0-9_.-]+)\/?/);
                        if (match && !['p', 'reel', 'reels', 'stories', 'explore', 'direct'].includes(match[1])) {
                            username = match[1];
                        }
                    }
                }

                // Priority 3: Explicit header links
                if (username === "Unknown") {
                    let userLinks = container.querySelectorAll('header a, div[dir="auto"] a, span[dir="auto"] a');
                    for (let a of userLinks) {
                        let text = a.textContent.trim();
                        if (text && text.length > 0 && !text.includes(' ') && !a.querySelector('img') && !['Follow', 'Seguir'].includes(text)) {
                            username = text;
                            break;
                        }
                    }
                }
            }
        }
    }
    return username;
}
