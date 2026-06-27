// src/telegram/ui/progress_bar.js
(function() {
    window.__md_tel_createProgressBar = (videoId, fileName) => {
        const isDarkMode = document.querySelector("html").classList.contains("night") || document.querySelector("html").classList.contains("theme-dark");
        let container = document.getElementById("tel-downloader-progress-bar-container");
        
        if (!container) {
            container = document.createElement("div");
            container.id = "tel-downloader-progress-bar-container";
            container.style.position = "fixed";
            container.style.bottom = 0;
            container.style.right = 0;
            container.style.zIndex = location.pathname.startsWith("/k/") ? 4 : 1600;
            document.body.appendChild(container);
        }

        const innerContainer = document.createElement("div");
        innerContainer.id = "tel-downloader-progress-" + videoId;
        innerContainer.style.width = "20rem";
        innerContainer.style.marginTop = "0.4rem";
        innerContainer.style.padding = "0.6rem";
        innerContainer.style.backgroundColor = isDarkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.6)";

        const flexContainer = document.createElement("div");
        flexContainer.style.display = "flex";
        flexContainer.style.justifyContent = "space-between";

        const title = document.createElement("p");
        title.className = "filename";
        title.style.margin = 0;
        title.style.color = "white";
        title.innerText = fileName;

        const closeButton = document.createElement("div");
        closeButton.style.cursor = "pointer";
        closeButton.style.fontSize = "1.2rem";
        closeButton.style.color = isDarkMode ? "#8a8a8a" : "white";
        closeButton.innerHTML = "&times;";
        closeButton.onclick = function () {
            container.removeChild(innerContainer);
        };

        const progressBar = document.createElement("div");
        progressBar.className = "progress";
        progressBar.style.backgroundColor = "#e2e2e2";
        progressBar.style.position = "relative";
        progressBar.style.width = "100%";
        progressBar.style.height = "1.6rem";
        progressBar.style.borderRadius = "2rem";
        progressBar.style.overflow = "hidden";

        const counter = document.createElement("p");
        counter.style.position = "absolute";
        counter.style.zIndex = 5;
        counter.style.left = "50%";
        counter.style.top = "50%";
        counter.style.transform = "translate(-50%, -50%)";
        counter.style.margin = 0;
        counter.style.color = "black";
        
        const progress = document.createElement("div");
        progress.style.position = "absolute";
        progress.style.height = "100%";
        progress.style.width = "0%";
        progress.style.backgroundColor = "#6093B5";

        progressBar.appendChild(counter);
        progressBar.appendChild(progress);
        flexContainer.appendChild(title);
        flexContainer.appendChild(closeButton);
        innerContainer.appendChild(flexContainer);
        innerContainer.appendChild(progressBar);
        container.appendChild(innerContainer);
    };

    window.__md_tel_updateProgress = (videoId, fileName, progress) => {
        const innerContainer = document.getElementById("tel-downloader-progress-" + videoId);
        if (!innerContainer) return;
        innerContainer.querySelector("p.filename").innerText = fileName;
        const progressBar = innerContainer.querySelector("div.progress");
        progressBar.querySelector("p").innerText = progress + "%";
        progressBar.querySelector("div").style.width = progress + "%";
    };

    window.__md_tel_completeProgress = (videoId) => {
        const el = document.getElementById("tel-downloader-progress-" + videoId);
        if (!el) return;
        const progressBar = el.querySelector("div.progress");
        progressBar.querySelector("p").innerText = "Completed";
        progressBar.querySelector("div").style.backgroundColor = "#B6C649";
        progressBar.querySelector("div").style.width = "100%";
    };

    window.__md_tel_AbortProgress = (videoId) => {
        const el = document.getElementById("tel-downloader-progress-" + videoId);
        if (!el) return;
        const progressBar = el.querySelector("div.progress");
        progressBar.querySelector("p").innerText = "Aborted";
        progressBar.querySelector("div").style.backgroundColor = "#D16666";
        progressBar.querySelector("div").style.width = "100%";
    };
})();
