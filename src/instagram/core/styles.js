/* Media Downloader - Styles: Injects all CSS into the page */

const style = document.createElement('style');
style.textContent = `
.md-mini-btn {
    position: absolute;
    bottom: 50px;
    right: 12px;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(8px);
    color: white;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 50%;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 9999;
    transition: all 0.2s ease;
    padding: 0;
}
.md-mini-btn:hover {
    background: rgba(15, 23, 42, 0.9);
    transform: scale(1.1);
}
.md-mini-btn.md-loading {
    opacity: 0.5;
    pointer-events: none;
}
.md-mini-btn.md-success {
    background: #10b981;
    color: white;
    border-color: transparent;
}
.md-mini-btn.md-skipped {
    background: #f59e0b;
    color: white;
    border-color: transparent;
}
.md-mini-btn.md-error {
    background: #ef4444;
    color: white;
    border-color: transparent;
}
.md-pfp-extracting {
    position: relative;
    overflow: hidden;
    background: transparent !important;
}
.md-pfp-extracting::before {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 0%;
    background: rgba(16, 185, 129, 0.9);
    z-index: 0;
    animation: mdPfpFill 3.2s ease-in-out forwards;
}
.md-pfp-extracting svg {
    position: relative;
    z-index: 1;
}
@keyframes mdPfpFill {
    0% { height: 0%; }
    100% { height: 100%; }
}
/* For the floating story button */
#md-floating-btn {
    position: fixed;
    bottom: 90px;
    right: 20px;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(8px);
    color: white;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 50%;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 999999;
    transition: all 0.2s ease;
}
#md-floating-btn:hover {
    background: rgba(15, 23, 42, 0.9);
    transform: scale(1.1);
}
/* Continuous Story Progress Bar */
#md-story-progress-container {
    position: absolute;
    top: -12px;
    bottom: -12px;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    z-index: 99999;
    gap: 10px;
    padding: 0 4px;
}

#md-story-slider {
    flex-grow: 1;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
    height: 100%;
    min-height: 32px !important;
    margin: 0;
    padding: 0;
}
#md-story-slider::-webkit-slider-runnable-track {
    width: 100%;
    height: 6px;
    background: linear-gradient(to right, rgba(255, 255, 255, 1) var(--md-progress, 0%), rgba(255, 255, 255, 0.28) var(--md-progress, 0%));
    border-radius: 6px;
    border: none;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    transition: height 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.2s ease, box-shadow 0.2s ease;
}
#md-story-slider:hover::-webkit-slider-runnable-track,
#md-story-slider:active::-webkit-slider-runnable-track {
    height: 12px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}
#md-story-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #ffffff !important;
    border: 1px solid rgba(0, 0, 0, 0.1);
    margin-top: -7px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45), 0 0 1px rgba(0, 0, 0, 0.3);
    opacity: 0;
    transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), margin-top 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    transform: scale(0.5);
}
#md-story-slider:hover::-webkit-slider-thumb,
#md-story-slider:active::-webkit-slider-thumb {
    opacity: 1 !important;
    margin-top: -4px !important;
    transform: scale(1);
}
#md-story-slider::-moz-range-track {
    width: 100%;
    height: 6px;
    background: linear-gradient(to right, rgba(255, 255, 255, 1) var(--md-progress, 0%), rgba(255, 255, 255, 0.28) var(--md-progress, 0%));
    border-radius: 6px;
    border: none;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    transition: height 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.2s ease, box-shadow 0.2s ease;
}
#md-story-slider:hover::-moz-range-track,
#md-story-slider:active::-moz-range-track {
    height: 12px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}
#md-story-slider::-moz-range-thumb {
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #ffffff !important;
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45), 0 0 1px rgba(0, 0, 0, 0.3);
    opacity: 0;
    transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    transform: scale(0.5);
}
#md-story-slider:hover::-moz-range-thumb,
#md-story-slider:active::-moz-range-thumb {
    opacity: 1 !important;
    transform: scale(1);
}

#md-story-counter {
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    font-weight: 700;
    text-shadow: 0 1px 3px rgba(0,0,0,0.9);
    pointer-events: none;
    user-select: none;
    min-width: 36px;
    text-align: center;
    opacity: 0.9;
}

.md-hide-native-segments > div:not(#md-story-progress-container) {
    opacity: 0 !important;
    pointer-events: none !important;
}

/* Custom Video Progress Bar for Reels/Popups */
.md-video-progress-container {
    position: absolute;
    top: 0;
    left: 0;
    height: 16px;
    display: flex;
    align-items: stretch;
    z-index: 2147483647;
    pointer-events: none; /* Let clicks pass through to video */
    overflow: hidden; /* Clips the inner progress bar to match border-radius */
    will-change: transform;
    background: transparent !important;
}
.md-video-slider {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
    width: 100%;
    height: 100%;
    margin: 0;
    pointer-events: auto; /* Only slider gets clicks */
}
.md-video-slider::-webkit-slider-runnable-track {
    width: 100%;
    height: 4px;
    margin-top: 12px;
    background: linear-gradient(to right, rgba(255,255,255,0.95) var(--md-vid-progress, 0%), rgba(255,255,255,0.3) var(--md-vid-progress, 0%));
    transition: height 0.2s ease, margin-top 0.2s ease;
    border-radius: 0px;
    border: 1px solid rgba(0,0,0,0.15);
    box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}
.md-video-slider:hover::-webkit-slider-runnable-track {
    height: 8px;
    margin-top: 8px;
}
.md-video-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    height: 0px;
    width: 0px;
}

#md-overlay-root, #md-overlay-root *, .md-post-btn, .md-video-progress-container, .md-video-slider {
    overflow-anchor: none !important;
}

`;
(document.head || document.documentElement).appendChild(style);
