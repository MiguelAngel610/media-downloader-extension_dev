import { mdLog, logErrorOnce } from './logger.js';
import { clearStoryCheckpoint } from './story_resume.js';
import { pickBestImageUrl, pickBestVideoUrl } from './media_quality.js';
import { recordProfilePic, flushProfilePics } from './profile_pic_collector.js';
import { extractMediaTimestamp } from './time_utils.js';

window.__md_storyMedia = window.__md_storyMedia || {};

export function extractSignatureFromUrl(url) {
    if (!url) return null;
    try {
        let parts = new URL(url).pathname.split('/');
        return parts[parts.length - 1];
    } catch {
        // Relative or escaped URL: fall back to a plain filename match.
        let match = url.match(/\/([^\/]+\.(jpg|webp|mp4))/);
        return match ? match[1] : null;
    }
}

export function findStoryMedia(obj, parentUsername = "", parentTimestamp = null, checkResetFn = null) {
    if (!obj || typeof obj !== 'object') return;

    recordProfilePic(obj);

    let currentUsername = parentUsername;
    let currentTimestamp = parentTimestamp;

    if (obj.user && obj.user.username) currentUsername = obj.user.username;
    else if (obj.owner && obj.owner.username) currentUsername = obj.owner.username;
    else if (obj.author && obj.author.username) currentUsername = obj.author.username;
    else if (obj.username && typeof obj.username === 'string' && !obj.username.includes(' ')) currentUsername = obj.username;

    if (obj.latest_reel_media && checkResetFn) checkResetFn(currentUsername, obj.latest_reel_media);
    // Normalized to Unix seconds: device_timestamp is often in microseconds.
    let ownTimestamp = extractMediaTimestamp(obj);
    if (ownTimestamp) currentTimestamp = ownTimestamp;

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
            for (let v of obj.video_versions) {
                if (v.url) signatures.push(extractSignatureFromUrl(v.url));
            }
            mediaObj.url = pickBestVideoUrl(obj.video_versions) || "";
        } else if (obj.image_versions2 && obj.image_versions2.candidates && obj.image_versions2.candidates.length > 0) {
            for (let c of obj.image_versions2.candidates) {
                if (c.url) signatures.push(extractSignatureFromUrl(c.url));
            }
            mediaObj.url = pickBestImageUrl(obj.image_versions2.candidates) || "";
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
    } catch (err) { logErrorOnce('Ghost Seen Store (read)', err); }
    
    let seenKeys = Object.keys(seenUsers);
    let checkResetFn = null;
    if (seenKeys.length > 0) {
        checkResetFn = function(uname, ts) {
            if (!uname || !ts || !seenUsers[uname]) return;
            let seenTime = typeof seenUsers[uname] === 'object' ? seenUsers[uname].seenAt : seenUsers[uname];
            let numTs = Number(ts);
            if (isNaN(numTs) || numTs <= 0) return;

            let tsMs = numTs;
            if (numTs > 1e14) tsMs = Math.floor(numTs / 1000); // Microseconds to milliseconds
            else if (numTs < 1e11) tsMs = numTs * 1000;       // Seconds to milliseconds

            if (tsMs > seenTime + 10000) { // Genuinely new story uploaded after previous view (10s buffer)
                delete seenUsers[uname];
                seenModified = true;
                clearStoryCheckpoint(uname);
                mdLog("✨ Story Alert", `New story posted by @${uname} after previous view — Ring restored to colorful`, "#06b6d4");
            }
        };
    }
    
    findStoryMedia(data, "", null, checkResetFn);
    flushProfilePics();

    if (seenModified) {
        try {
            localStorage.setItem('md_ghost_seen_users', JSON.stringify(seenUsers));
            if (window.__md_applyGhostVisuals) window.__md_applyGhostVisuals();
        } catch (err) { logErrorOnce('Ghost Seen Store (write)', err); }
    }
    
    window.postMessage({ type: 'MD_STORY_MEDIA_UPDATE', media: window.__md_storyMedia }, '*');
}
