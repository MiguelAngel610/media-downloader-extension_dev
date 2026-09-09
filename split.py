import os
import re

with open('src/instagram/features/video_progress.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. utils.js
# Extract syncModalScrollLock, and maybe some common dragging listeners if any.
# Actually, syncModalScrollLock is just a function.
# Let's extract getActiveStoryMedias to story.js.

utils_code = """export function syncModalScrollLock(openDialog) {
    if (openDialog || document.body.style.overflow === 'hidden' || document.body.style.overflow === 'clip') {
        if (document.documentElement.style.overflow !== 'hidden') {
            document.documentElement.style.overflow = 'hidden';
        }
    } else {
        if (document.documentElement.style.overflow === 'hidden') {
            document.documentElement.style.overflow = '';
        }
    }
}
"""
with open('src/instagram/features/progress/utils.js', 'w', encoding='utf-8') as f:
    f.write(utils_code)

# 2. story.js
# Extract getActiveStoryMedias and syncStoryProgressBar
story_regex = re.compile(r'function getActiveStoryMedias\(\) \{.*?\n\}\n\nfunction syncStoryProgressBar\(\) \{.*?\n\}\n', re.DOTALL)
story_match = story_regex.search(code)
if not story_match:
    print("Could not match story block!")
    exit(1)
story_code = story_match.group(0)

# Apply bug fixes to story_code
# Fix 1: Relaxed animation filter
old_filter = """                            if (isSegmentAnim) {
                                if (!window.__md_activeStorySegment || !window.__md_activeStorySegment.contains(t)) {
                                    continue;
                                }
                            }"""
new_filter = """                            if (isSegmentAnim) {
                                // Relaxed: We just accept any animation inside the segments container
                            }"""
story_code = story_code.replace(old_filter, new_filter)

# Fix 2: Remove the pct jump patch
old_jump_patch = """                if (pct >= 96.5) pct = 100;
                if (pct <= 1.0 && pct > 0) pct = 0;
"""
story_code = story_code.replace(old_jump_patch, "")

story_file_code = f"""export {story_code}"""
# Make the functions exported
story_file_code = story_file_code.replace("function getActiveStoryMedias", "export function getActiveStoryMedias")
story_file_code = story_file_code.replace("function syncStoryProgressBar", "export function syncStoryProgressBar")

with open('src/instagram/features/progress/story.js', 'w', encoding='utf-8') as f:
    f.write(story_file_code)

# 3. feed.js
# Extract startSyncLoop and inside it syncOverlays. Wait, syncOverlays is inside startSyncLoop.
# Let's extract the body of syncOverlays to feed.js.
loop_regex = re.compile(r'function startSyncLoop\(\) \{\n.*?function syncOverlays\(\) \{(.*?)\}\n\n    function frame\(\).*', re.DOTALL)
loop_match = loop_regex.search(code)
if not loop_match:
    print("Could not match loop block!")
    exit(1)
sync_overlays_body = loop_match.group(1)

feed_file_code = """import { syncStoryProgressBar } from './story.js';
import { syncModalScrollLock } from './utils.js';

export function syncOverlays() {""" + sync_overlays_body + """}
"""
with open('src/instagram/features/progress/feed.js', 'w', encoding='utf-8') as f:
    f.write(feed_file_code)

# 4. loop.js
# We need the global vars and startSyncLoop
loop_file_code = """import { syncOverlays } from './feed.js';

let mdSuspendUntil = 0;

export function startSyncLoop() {
    if (window.__md_overlaySyncLoopStarted) return;
    window.__md_overlaySyncLoopStarted = true;

    function frame() {
        if (Date.now() < mdSuspendUntil) {
            requestAnimationFrame(frame);
            return;
        }
        syncOverlays();
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

// Override suspend if needed by importing
export function suspendSync(duration) {
    mdSuspendUntil = Date.now() + duration;
}
"""

with open('src/instagram/features/progress/loop.js', 'w', encoding='utf-8') as f:
    f.write(loop_file_code)

# Let's check if video_progress.js had mdLastUrl logic inside frame
frame_regex = re.compile(r'function frame\(\) \{(.*?)\}\n    requestAnimationFrame\(frame\);\n\}', re.DOTALL)
frame_match = frame_regex.search(code)
if frame_match:
    frame_body = frame_match.group(1)
    loop_file_code = """import { syncOverlays } from './feed.js';

let mdLastUrl = window.location.href;
let mdSuspendUntil = 0;

export function startSyncLoop() {
    if (window.__md_overlaySyncLoopStarted) return;
    window.__md_overlaySyncLoopStarted = true;

    function frame() {""" + frame_body + """}
    requestAnimationFrame(frame);
}
"""
    with open('src/instagram/features/progress/loop.js', 'w', encoding='utf-8') as f:
        f.write(loop_file_code)

# 5. index.js
index_code = """import { startSyncLoop } from './loop.js';

// Inicializar el ciclo
startSyncLoop();
"""
with open('src/instagram/features/progress/index.js', 'w', encoding='utf-8') as f:
    f.write(index_code)

print("Split completed successfully!")
