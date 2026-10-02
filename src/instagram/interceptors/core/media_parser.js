import { mdLog } from './logger.js';

window.__md_storyMedia = window.__md_storyMedia || {};

export function extractSignatureFromUrl(url) {
    if (!url) return null;
    try {
        let parts = new URL(url).pathname.split('/');
        return parts[parts.length - 1];
    } catch (e) {
        let match = url.match(/\/([^\/]+\.(jpg|webp|mp4))/);
        return match ? match[1] : null;
    }
}

export function findStoryMedia(obj, parentUsername = "", parentTimestamp = null, checkResetFn = null) {
    if (!obj || typeof obj !== 'object') return;

    let currentUsername = parentUsername;
    let currentTimestamp = parentTimestamp;

    if (obj.user && obj.user.username) currentUsername = obj.user.username;
    else if (obj.owner && obj.owner.username) currentUsername = obj.owner.username;
    else if (obj.author && obj.author.username) currentUsername = obj.author.username;
    else if (obj.username && typeof obj.username === 'string' && !obj.username.includes(' ')) currentUsername = obj.username;

    if (obj.latest_reel_media && checkResetFn) checkResetFn(currentUsername, obj.latest_reel_media);
    if (obj.taken_at) currentTimestamp = obj.taken_at;
    else if (obj.taken_at_timestamp) currentTimestamp = obj.taken_at_timestamp;
    else if (obj.device_timestamp) currentTimestamp = obj.device_timestamp;

    if (currentUsername && currentTimestamp && checkResetFn) {
        checkResetFn(currentUsername, currentTimestamp);
    }

    if ((obj.video_versions || obj.image_versions2) && (obj.id || obj.pk)) {
        let id = obj.id || obj.pk;
        if (typeof id === 'string' && id.includes('_')) id = id.split('_')[0];

        let signatures = [];

        let sharedItem = null;
        let feedAtt = (obj.story_feed_media && obj.story_feed_media[0]) || (obj.reeling_media && obj.reeling_media[0]) || (obj.story_reels_media && obj.story_reels_media[0]) || obj.media_mentions;
        if (feedAtt) {
            let isReel = !!(obj.reeling_media || obj.story_reels_media);
            let code = feedAtt.media_code || feedAtt.shortcode || feedAtt.code;
            let uname = (feedAtt.user && feedAtt.user.username) || (feedAtt.owner && feedAtt.owner.username) || "";
            let href = code ? (isReel ? `https://www.instagram.com/reel/${code}/` : `https://www.instagram.com/p/${code}/`) : null;
            let label = uname ? `@${uname}` : (isReel ? 'Watch Reel' : 'See Post');
            sharedItem = { isReel, label, href };
        }

        let mediaObj = {
            url: "",
            username: currentUsername || "",
            timestamp: currentTimestamp || Math.floor(Date.now() / 1000),
            shortcode: (obj.code && !/^\d+$/.test(obj.code)) ? obj.code : ((obj.shortcode && !/^\d+$/.test(obj.shortcode)) ? obj.shortcode : null),
            media_id: id,
            dash_manifest: obj.video_dash_manifest || null,
            signatures: signatures,
            shared_item: sharedItem
        };

        if (obj.video_versions && obj.video_versions.length > 0) {
            let bestVideo = obj.video_versions[0];
            let maxScore = [bestVideo.width || 0, bestVideo.height || 0, bestVideo.type || 0];

            for (let v of obj.video_versions) {
                if (v.url) signatures.push(extractSignatureFromUrl(v.url));

                let score = [v.width || 0, v.height || 0, v.type || 0];
                if (score[0] > maxScore[0] ||
                    (score[0] === maxScore[0] && score[1] > maxScore[1]) ||
                    (score[0] === maxScore[0] && score[1] === maxScore[1] && score[2] > maxScore[2])) {
                    maxScore = score;
                    bestVideo = v;
                }
            }
            mediaObj.url = bestVideo.url;
        } else if (obj.image_versions2 && obj.image_versions2.candidates && obj.image_versions2.candidates.length > 0) {
            let bestImg = obj.image_versions2.candidates[0];
            let maxScore = [bestImg.width || 0, bestImg.height || 0];

            for (let c of obj.image_versions2.candidates) {
                if (c.url) signatures.push(extractSignatureFromUrl(c.url));

                let score = [c.width || 0, c.height || 0];
                if (score[0] > maxScore[0] || (score[0] === maxScore[0] && score[1] > maxScore[1])) {
                    maxScore = score;
                    bestImg = c;
                }
            }
            mediaObj.url = bestImg.url;
        }

        if (mediaObj.url) {
            window.__md_storyMedia[id] = mediaObj;
        }
    }

    for (let k in obj) {
        if (obj[k] && typeof obj[k] === 'object') {
            findStoryMedia(obj[k], currentUsername, currentTimestamp, checkResetFn);
        }
    }
}

export function processAndPostData(data) {
    if (!data) return;
    
    let seenUsers = {};
    let seenModified = false;
    try {
        seenUsers = JSON.parse(localStorage.getItem('md_ghost_seen_users') || '{}');
    } catch(e) {}
    
    let seenKeys = Object.keys(seenUsers);
    let checkResetFn = null;
    if (seenKeys.length > 0) {
        checkResetFn = function(uname, ts) {
            if (!uname || !ts || !seenUsers[uname]) return;
            let seenTime = typeof seenUsers[uname] === 'object' ? seenUsers[uname].seenAt : seenUsers[uname];
            let tsMs = ts > 100000000000 ? ts : ts * 1000;
            if (tsMs > seenTime + 5000) { // New story uploaded after previous view
                delete seenUsers[uname];
                seenModified = true;
                mdLog("✨ Story Alert", `New story posted by @${uname} after previous view — Ring restored to colorful`, "#06b6d4");
            }
        };
    }
    
    findStoryMedia(data, "", null, checkResetFn);
    
    if (seenModified) {
        try {
            localStorage.setItem('md_ghost_seen_users', JSON.stringify(seenUsers));
            if (window.__md_applyGhostVisuals) window.__md_applyGhostVisuals();
        } catch(e) {}
    }
    
    window.postMessage({ type: 'MD_STORY_MEDIA_UPDATE', media: window.__md_storyMedia }, '*');
}
