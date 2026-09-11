// src/telegram/core/media_capture.js
(function() {
    const logger = window.__md_tel_logger || console;

    window.__md_tel_capture_video_element = (videoElement, fileNameHint, stableIdHint) => {
        if (!videoElement || typeof videoElement.captureStream !== "function") {
            logger.error("This browser/element does not support captureStream(); cannot capture video.", fileNameHint);
            if (window.__md_tel_showToast) window.__md_tel_showToast("No se pudo capturar el video (captureStream no soportado)", true);
            return;
        }

        // Pick the best available mimeType. Prefer NATIVE mp4 output (Chrome
        // 105+ supports MediaRecorder recording directly to mp4/H.264) so the
        // result is a real .mp4 file with no extra conversion step. Falls
        // back to webm on browsers that don't support mp4 recording yet.
        const candidateTypes = [
            "video/mp4;codecs=avc1,mp4a",
            "video/mp4;codecs=h264,aac",
            "video/mp4",
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp9",
            "video/webm;codecs=vp8,opus",
            "video/webm",
        ];
        const mimeType = candidateTypes.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "video/webm";
        const outputExt = mimeType.startsWith("video/mp4") ? "mp4" : "webm";

        const videoId = (Math.random() + 1).toString(36).substring(2, 10) + "_" + Date.now().toString();
        
        let hash = stableIdHint;
        if (!hash && videoElement && videoElement.duration) {
            hash = window.__md_tel_hashCode ? window.__md_tel_hashCode(videoElement.duration + "_" + videoElement.videoWidth + "_" + videoElement.videoHeight).toString(36) : Date.now().toString();
        }
        if (!hash) {
            hash = "video";
            try {
                const src = videoElement.currentSrc || videoElement.src || videoElement.querySelector("source")?.src;
                if (src) hash = window.__md_tel_hashCode ? window.__md_tel_hashCode(src).toString(36) : Date.now().toString();
            } catch(e){}
        }
        const fileName = window.FilenameFormatter ? window.FilenameFormatter.format(fileNameHint, hash, outputExt) : `${fileNameHint || hash}.${outputExt}`;

        if (window.__md_tel_createProgressBar) {
            window.__md_tel_createProgressBar(videoId, fileName);
        }

        const wasPaused = videoElement.paused;
        const originalTime = videoElement.currentTime;
        const originalMuted = videoElement.muted;

        let stream;
        try {
            stream = videoElement.captureStream();
        } catch (e) {
            logger.error("captureStream() failed: " + e, fileName);
            if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
            return;
        }

        // Scale bitrate to the actual source resolution so we never under-
        // allocate quality for higher-res videos, nor waste size on tiny ones.
        // ~0.1 bits per pixel per frame at 30fps is a generous/high-quality
        // target (well above typical streaming bitrates for the same res).
        const w = videoElement.videoWidth || 1280;
        const h = videoElement.videoHeight || 720;
        const pixelCount = w * h;
        const targetBitrate = Math.min(
            20_000_000, // hard cap to avoid pathological file sizes
            Math.max(8_000_000, Math.round(pixelCount * 30 * 0.12))
        );

        let recorder;
        try {
            recorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: targetBitrate,
            });
        } catch (e) {
            logger.error("MediaRecorder init failed: " + e, fileName);
            if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
            return;
        }

        const chunks = [];
        let finished = false;

        const cleanupVideoState = () => {
            try {
                videoElement.currentTime = originalTime;
                videoElement.muted = originalMuted;
                if (wasPaused) videoElement.pause();
            } catch (e) {}
        };

        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onerror = (e) => {
            logger.error("MediaRecorder error: " + (e.error || e), fileName);
            if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
            cleanupVideoState();
        };

        recorder.onstop = () => {
            if (finished) return; // already handled (e.g. via timeupdate completion)
            finished = true;
            cleanupVideoState();

            if (chunks.length === 0) {
                logger.error("No data captured from video element.", fileName);
                if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
                return;
            }

            const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            document.body.appendChild(a);
            a.href = blobUrl;
            a.download = fileName;
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);

            if (window.__md_tel_completeProgress) window.__md_tel_completeProgress(videoId);
            logger.info("Captured video saved as " + fileName, fileName);
        };

        const duration = videoElement.duration;
        const hasFiniteDuration = isFinite(duration) && duration > 0;

        const onTimeUpdate = () => {
            if (hasFiniteDuration && window.__md_tel_updateProgress) {
                const pct = Math.min(100, ((videoElement.currentTime / duration) * 100)).toFixed(0);
                window.__md_tel_updateProgress(videoId, fileName, pct);
            }
            // Stop once we've played through to (approximately) the end.
            if (hasFiniteDuration && videoElement.currentTime >= duration - 0.15) {
                videoElement.removeEventListener("timeupdate", onTimeUpdate);
                if (recorder.state !== "inactive") recorder.stop();
            }
        };

        videoElement.addEventListener("timeupdate", onTimeUpdate);
        videoElement.addEventListener("ended", () => {
            videoElement.removeEventListener("timeupdate", onTimeUpdate);
            if (recorder.state !== "inactive") recorder.stop();
        }, { once: true });

        // Restart from the beginning so we capture the whole clip, muted so
        // the user isn't forced to hear it twice while it captures.
        try {
            videoElement.currentTime = 0;
            videoElement.muted = true;
            recorder.start();
            const playPromise = videoElement.play();
            if (playPromise && playPromise.catch) playPromise.catch(() => {});
        } catch (e) {
            logger.error("Failed to start capture: " + e, fileName);
            if (window.__md_tel_AbortProgress) window.__md_tel_AbortProgress(videoId);
            cleanupVideoState();
            return;
        }

        // Safety timeout in case `duration` is Infinity/unavailable (e.g. some
        // live/stream-like elements) — cap capture at 5 minutes so it can't
        // hang forever.
        if (!hasFiniteDuration) {
            setTimeout(() => {
                if (recorder.state !== "inactive") recorder.stop();
            }, 5 * 60 * 1000);
        }
    };
})();
