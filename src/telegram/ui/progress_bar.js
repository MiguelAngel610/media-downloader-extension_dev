// src/telegram/ui/progress_bar.js
(function() {
    let repositionTimer = null;

    function repositionContainer(container) {
        if (!container) return;

        if (container.children.length === 0) {
            if (repositionTimer) {
                clearInterval(repositionTimer);
                repositionTimer = null;
            }
            return;
        }

        const candidates = Array.from(document.querySelectorAll("#MediaViewer, .media-viewer-whole, #StoryViewer, #stories-viewer, .MediaViewer, .StoryViewer, [role='dialog'], .modal-container, .popup-container"));
        const isVisible = (el) => {
            if (!el || !document.body.contains(el)) return false;
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) <= 0.01) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        const activeOverlays = candidates.filter(isVisible);
        // Mount inside active fullscreen element or inside the topmost active Telegram modal; fallback to body
        const targetParent = document.fullscreenElement || (activeOverlays.length > 0 ? activeOverlays[activeOverlays.length - 1] : document.body);

        if (targetParent && (container.parentElement !== targetParent || container.nextElementSibling !== null)) {
            targetParent.appendChild(container);
        }
    }

    function getOrCreateContainer() {
        let container = document.getElementById("tel-downloader-progress-bar-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "tel-downloader-progress-bar-container";
        }
        // Always force maximum CSS z-index and positioning
        container.style.position = "fixed";
        container.style.bottom = "20px";
        container.style.right = "20px";
        container.style.zIndex = "2147483647"; // Maximum possible 32-bit integer in CSS
        container.style.pointerEvents = "none";

        repositionContainer(container);
        return container;
    }

    function activateContainer(container) {
        repositionContainer(container);
        if (!repositionTimer && container.children.length > 0) {
            repositionTimer = setInterval(() => {
                const el = document.getElementById("tel-downloader-progress-bar-container");
                if (el) repositionContainer(el);
            }, 300);
        }
    }

    window.__md_tel_createProgressBar = (videoId, fileName) => {
        const container = getOrCreateContainer();
        const isDarkMode = document.querySelector("html")?.classList.contains("night") || document.querySelector("html")?.classList.contains("theme-dark");

        const innerContainer = document.createElement("div");
        innerContainer.id = "tel-downloader-progress-" + videoId;
        innerContainer.style.width = "22rem";
        innerContainer.style.marginTop = "0.6rem";
        innerContainer.style.padding = "0.8rem 1rem";
        innerContainer.style.backgroundColor = isDarkMode ? "rgba(24, 24, 27, 0.95)" : "rgba(39, 39, 42, 0.95)";
        innerContainer.style.border = "1px solid rgba(255, 255, 255, 0.15)";
        innerContainer.style.borderRadius = "8px";
        innerContainer.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.7)";
        innerContainer.style.backdropFilter = "blur(12px)";
        innerContainer.style.pointerEvents = "auto";
        innerContainer.style.transition = "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)";

        const flexContainer = document.createElement("div");
        flexContainer.style.display = "flex";
        flexContainer.style.justifyContent = "space-between";
        flexContainer.style.alignItems = "center";
        flexContainer.style.marginBottom = "0.5rem";

        const title = document.createElement("p");
        title.className = "filename";
        title.style.margin = "0";
        title.style.color = "#ffffff";
        title.style.fontSize = "0.85rem";
        title.style.fontWeight = "600";
        title.style.whiteSpace = "nowrap";
        title.style.overflow = "hidden";
        title.style.textOverflow = "ellipsis";
        title.style.maxWidth = "18rem";
        title.innerText = fileName;

        const closeButton = document.createElement("div");
        closeButton.style.cursor = "pointer";
        closeButton.style.fontSize = "1.2rem";
        closeButton.style.color = isDarkMode ? "#a1a1aa" : "#e4e4e7";
        closeButton.innerHTML = "&times;";
        closeButton.onclick = function () {
            const parent = innerContainer.parentNode;
            if (parent) {
                parent.removeChild(innerContainer);
                repositionContainer(parent);
            }
        };

        const progressBar = document.createElement("div");
        progressBar.className = "progress";
        progressBar.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
        progressBar.style.position = "relative";
        progressBar.style.width = "100%";
        progressBar.style.height = "1.4rem";
        progressBar.style.borderRadius = "1rem";
        progressBar.style.overflow = "hidden";

        const counter = document.createElement("p");
        counter.style.position = "absolute";
        counter.style.zIndex = "5";
        counter.style.left = "50%";
        counter.style.top = "50%";
        counter.style.transform = "translate(-50%, -50%)";
        counter.style.margin = "0";
        counter.style.color = "#ffffff";
        counter.style.fontSize = "0.75rem";
        counter.style.fontWeight = "700";
        counter.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
        
        const progress = document.createElement("div");
        progress.style.position = "absolute";
        progress.style.height = "100%";
        progress.style.width = "0%";
        progress.style.backgroundColor = "#38bdf8";
        progress.style.transition = "width 0.2s ease, background-color 0.3s ease";

        progressBar.appendChild(counter);
        progressBar.appendChild(progress);
        flexContainer.appendChild(title);
        flexContainer.appendChild(closeButton);
        innerContainer.appendChild(flexContainer);
        innerContainer.appendChild(progressBar);
        container.appendChild(innerContainer);

        activateContainer(container);
    };

    function __md_tel_setupAutoClose(el) {
        if (el.__md_tel_autoCloseTimeout) {
            clearTimeout(el.__md_tel_autoCloseTimeout);
        }

        const startTimer = () => {
            el.__md_tel_autoCloseTimeout = setTimeout(() => {
                const parent = el.parentNode;
                if (parent) {
                    parent.removeChild(el);
                    repositionContainer(parent);
                }
            }, 3000);
        };

        const stopTimer = () => {
            if (el.__md_tel_autoCloseTimeout) {
                clearTimeout(el.__md_tel_autoCloseTimeout);
                el.__md_tel_autoCloseTimeout = null;
            }
        };

        el.addEventListener("mouseenter", stopTimer);
        el.addEventListener("mouseleave", startTimer);

        // Start it immediately
        startTimer();
    }

    window.__md_tel_updateProgress = (videoId, fileName, progress) => {
        getOrCreateContainer(); // Re-assert z-index and parent placement during progress updates
        const innerContainer = document.getElementById("tel-downloader-progress-" + videoId);
        if (!innerContainer) return;
        innerContainer.querySelector("p.filename").innerText = fileName;
        const progressBar = innerContainer.querySelector("div.progress");
        progressBar.querySelector("p").innerText = progress + "%";
        progressBar.querySelector("div").style.width = progress + "%";
    };

    window.__md_tel_completeProgress = (videoId) => {
        getOrCreateContainer();
        const el = document.getElementById("tel-downloader-progress-" + videoId);
        if (!el) return;
        const progressBar = el.querySelector("div.progress");
        progressBar.querySelector("p").innerText = "Completed";
        progressBar.querySelector("div").style.backgroundColor = "#22c55e"; // Vibrant success green
        progressBar.querySelector("div").style.width = "100%";
        
        __md_tel_setupAutoClose(el);
    };

    window.__md_tel_AbortProgress = (videoId) => {
        getOrCreateContainer();
        const el = document.getElementById("tel-downloader-progress-" + videoId);
        if (!el) return;
        const progressBar = el.querySelector("div.progress");
        progressBar.querySelector("p").innerText = "Aborted";
        progressBar.querySelector("div").style.backgroundColor = "#ef4444"; // Vibrant error red
        progressBar.querySelector("div").style.width = "100%";
        
        __md_tel_setupAutoClose(el);
    };

    // Lightweight one-off toast for failures that don't have an associated progress bar
    // (e.g. image downloads, which previously failed completely silently).
    window.__md_tel_showToast = (message, isError = false) => {
        if (window.MDToastManager) {
            if (isError) {
                window.MDToastManager.showError(message);
            } else {
                window.MDToastManager.showInfo(message);
            }
        }
    };
})();
