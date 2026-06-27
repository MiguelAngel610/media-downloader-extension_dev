/* Media Downloader for X - Download button injection */

const downloadSvg = `
<svg viewBox="0 0 24 24" aria-hidden="true" style="width: 18.75px; height: 18.75px; fill: currentColor;">
    <g>
        <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"></path>
        <path d="M12 16l4-4h-3V8h-2v4H8l4 4z"></path>
    </g>
</svg>
`;

function injectDownloadButtons() {
    const actionGroups = document.querySelectorAll('[role="group"]:not(.md-injected-x)');

    actionGroups.forEach(group => {
        const replyBtn = group.querySelector('[data-testid="reply"]');
        const likeBtn = group.querySelector('[data-testid="like"]') || group.querySelector('[data-testid="unlike"]');

        if (replyBtn) {
            group.classList.add('md-injected-x');

            const article = group.closest('article');
            let tweetId = null;

            if (article) {
                const timeElements = article.querySelectorAll('time');
                for (let timeEl of timeElements) {
                    const link = timeEl.closest('a');
                    if (link && link.href) {
                        const urlMatch = link.href.match(/status\/(\d+)/);
                        if (urlMatch) {
                            tweetId = urlMatch[1];
                            break;
                        }
                    }
                }
            }

            if (!tweetId) {
                const urlMatch = window.location.href.match(/status\/(\d+)/);
                if (urlMatch) tweetId = urlMatch[1];
            }

            if (!tweetId) return;

            const templateBtn = replyBtn;
            if (!templateBtn) return;

            let buttonWrapper = templateBtn;
            while (buttonWrapper && buttonWrapper.parentElement !== group) {
                buttonWrapper = buttonWrapper.parentElement;
            }

            if (!buttonWrapper || buttonWrapper === group) return;

            const clone = buttonWrapper.cloneNode(true);
            clone.classList.add('md-download-btn');

            const svgElement = clone.querySelector('svg');
            if (svgElement) {
                svgElement.outerHTML = downloadSvg;
            }

            const spanText = clone.querySelector('span');
            if (spanText) spanText.textContent = '';

            clone.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const innerSvg = clone.querySelector('svg');
                if (innerSvg) {
                    innerSvg.style.transform = 'scale(0.8)';
                    setTimeout(() => innerSvg.style.transform = 'scale(1)', 150);
                }

                window.postMessage({
                    action: "GET_X_VIDEO",
                    tweetId: tweetId
                }, "*");
            });

            const bookmarkBtn = group.querySelector('[data-testid="bookmark"]') || group.querySelector('[data-testid="removeBookmark"]');
            const shareBtn = group.querySelector('[aria-label="Share Tweet"], [aria-label="Share post"]');

            let insertAnchor = null;
            if (bookmarkBtn) {
                let curr = bookmarkBtn;
                while(curr && curr.parentElement !== group) curr = curr.parentElement;
                insertAnchor = curr;
            } else if (shareBtn) {
                let curr = shareBtn;
                while(curr && curr.parentElement !== group) curr = curr.parentElement;
                insertAnchor = curr;
            }

            if (insertAnchor && insertAnchor.nextSibling) {
                group.insertBefore(clone, insertAnchor.nextSibling);
            } else {
                group.appendChild(clone);
            }
        }
    });
}
