/**
 * @fileoverview Entry point of the Instagram content script (ISOLATED world), bundled by esbuild into
 * dist/ig_content.bundle.js (content scripts cannot be ES modules in the manifest).
 * Imports run in this order, the same order the files had as classic scripts in manifest.json:
 * shared state and the page-world bridge first, the feature entry points last.
 */
import './core/state.js';
import './core/styles.js';
import './core/ig_interceptor_init.js';
import './utils/platform.js';
import './ui/svgs.js';
import './ui/overlay_root.js';
import './utils/username_resolver.js';
import './media_resolution/clicked_media.js';
import './media_resolution/media_sources.js';
import './utils/media_resolver.js';
import './utils/pfp_resolver.js';
import './download/download_metadata.js';
import './download/download_target.js';
import './download/download_feedback.js';
import './ui/button_state.js';
import './features/pfp_button.js';
import './stories/story_viewport.js';
import './stories/shared_post_detector.js';
import './stories/story_button_state.js';
import './stories/story_dots_locator.js';
import './stories/story_media_locator.js';
import './stories/story_media_lookup.js';
import './features/story_button.js';
import './features/feed_buttons.js';
import './features/progress/index.js';
import './features/auto_backup.js';
import './main.js';
