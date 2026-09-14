import os

with open('src/instagram/features/video_progress.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find boundaries
utils_start = 5
utils_end = 16

story_start = 17
story_end = 343

loop_start = 344

utils_code = "".join(lines[utils_start:utils_end+1])
utils_code = "export " + utils_code

story_code = "".join(lines[story_start:story_end+1])
# Relax filter
old_filter = """                            if (isSegmentAnim) {
                                if (!window.__md_activeStorySegment || !window.__md_activeStorySegment.contains(t)) {
                                    continue;
                                }
                            }"""
new_filter = """                            if (isSegmentAnim) {
                                // Relaxed: We accept any animation inside the segments container
                            }"""
story_code = story_code.replace(old_filter, new_filter)
# Remove pct clamp
old_clamp = """                if (pct >= 96.5) pct = 100;
                if (pct <= 1.0 && pct > 0) pct = 0;
"""
story_code = story_code.replace(old_clamp, "")
story_code = story_code.replace("function getActiveStoryMedias", "export function getActiveStoryMedias")
story_code = story_code.replace("function syncStoryProgressBar", "export function syncStoryProgressBar")


# The rest is loop.js and feed.js
# Let's extract the feed logic manually. It's inside startSyncLoop -> syncOverlays.
feed_code = []
loop_code = []

in_sync_overlays = False
brace_count = 0

for i in range(loop_start, len(lines)):
    line = lines[i]
    if "function syncOverlays()" in line:
        in_sync_overlays = True
        brace_count = 1
        continue
    
    if in_sync_overlays:
        brace_count += line.count('{')
        brace_count -= line.count('}')
        if brace_count == 0:
            in_sync_overlays = False
            continue
        feed_code.append(line)
    else:
        loop_code.append(line)

feed_file = """import { syncStoryProgressBar } from './story.js';
import { syncModalScrollLock } from './utils.js';

export function syncOverlays() {
""" + "".join(feed_code) + "\n}\n"

loop_file = """import { syncOverlays } from './feed.js';

let mdLastUrl = window.location.href;
let mdSuspendUntil = 0;

""" + "".join(loop_code)
loop_file = loop_file.replace("function startSyncLoop", "export function startSyncLoop")

index_file = """import { startSyncLoop } from './loop.js';
startSyncLoop();
"""

with open('src/instagram/features/progress/utils.js', 'w', encoding='utf-8') as f: f.write(utils_code)
with open('src/instagram/features/progress/story.js', 'w', encoding='utf-8') as f: f.write(story_code)
with open('src/instagram/features/progress/feed.js', 'w', encoding='utf-8') as f: f.write(feed_file)
with open('src/instagram/features/progress/loop.js', 'w', encoding='utf-8') as f: f.write(loop_file)
with open('src/instagram/features/progress/index.js', 'w', encoding='utf-8') as f: f.write(index_file)

print("Split success!")
