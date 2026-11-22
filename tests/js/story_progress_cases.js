// Inputs for the story progress bar golden master (syncStoryProgressBar + getActiveStoryMedias, jsdom 1024x768).
// rect="left,top,width,height" fakes layout. A segment row is Instagram's thin bar of story segments; each
// segment holds a "fill" div whose visible width is the progress of that segment (130 px = 100 %).
const STORY = 'https://www.instagram.com/stories/alice/111/';
const fill = (id, width, left) => `<div id="fill${id}" style="width: ${Math.round(width / 1.3)}%" rect="${left},12,${width},2"></div>`;
/** @param {number[]} widths - visible fill width (px) of each segment */
const row = (widths, { rowId = 'row', top = 10, left = 312, extra = '' } = {}) =>
    `<div id="${rowId}" style="display:flex" rect="${left},${top},400,4">${widths.map((width, i) =>
        `<div id="${rowId}seg${i + 1}" rect="${left + i * 135},${top + 2},130,2">${fill(`${rowId}${i + 1}`, width, left + i * 135)}</div>`).join('')}${extra}</div>`;
const dlButton = '<div class="md-native-btn md-story-dl-btn-inline" id="dl" rect="700,20,24,24"></div>';
const story = (inner, media = '') => `<section id="story"><header id="hdr" rect="312,0,400,60">${dlButton}</header>${inner}${media}</section>`;
const video = (id, rect = '312,60,400,700', style = '') => `<video id="${id}" rect="${rect}" style="${style}"></video>`;

module.exports = [
    { name: 'second_segment_half', url: STORY, html: story(row([130, 65, 0])) },
    { name: 'first_segment_start', url: STORY, html: story(row([0, 0, 0])) },
    { name: 'all_segments_complete', url: STORY, html: story(row([130, 130, 130])) },
    { name: 'fast_path_last_known_index', url: STORY, html: story(row([130, 130, 40])), globals: { __md_lastKnownSegmentIndex: 3 } },
    { name: 'last_known_index_out_of_range', url: STORY, html: story(row([130, 20])), globals: { __md_lastKnownSegmentIndex: 9 } },
    { name: 'single_segment', url: STORY, html: story(row([91])) },
    { name: 'video_drives_percentage', url: STORY, html: story(row([65]), video('v1')), media: { '#v1': { duration: 10, currentTime: 4 } } },
    { name: 'ended_video_ignored', url: STORY, html: story(row([65]), video('v1')), media: { '#v1': { duration: 10, currentTime: 9, ended: true } } },
    { name: 'hidden_video_ignored', url: STORY, html: story(row([65]), video('v1', undefined, 'opacity:0')), media: { '#v1': { duration: 10, currentTime: 2 } } },
    { name: 'playing_audio_counts', url: STORY, html: story(row([65])) + '<audio id="a1"></audio>', media: { '#a1': { duration: 20, currentTime: 5, paused: false } } },
    { name: 'paused_audio_ignored', url: STORY, html: story(row([65])) + '<audio id="a1"></audio>', media: { '#a1': { duration: 20, currentTime: 5, paused: true } } },
    { name: 'dots_fallback_finds_video', url: STORY,
        html: `<section id="story"><header><div role="button" id="dots" rect="700,20,24,24"><svg><circle/><circle/><circle/></svg></div></header>${row([30])}${video('v1')}</section>`,
        media: { '#v1': { duration: 8, currentTime: 2 } } },
    { name: 'row_with_icon_rejected', url: STORY, html: story(row([65], { extra: '<svg></svg>' })) },
    { name: 'row_with_text_rejected', url: STORY, html: story(row([65], { extra: '<div>Hello</div>' })) },
    { name: 'row_with_counter_text_accepted', url: STORY, html: story(row([65], { extra: '<div>2/5</div>' })) },
    { name: 'row_off_center_rejected', url: STORY, html: story(row([65], { left: 750 })) },
    { name: 'topmost_centered_row_wins', url: STORY, html: story(row([130], { rowId: 'low', top: 80 }) + row([65], { rowId: 'top', top: 10 })) },
    { name: 'structural_scan_without_inline_width', url: STORY,
        html: story('<div id="row" style="display:flex" rect="312,10,400,4"><div id="rowseg1" rect="312,12,130,2"><div id="fillrow1" rect="312,12,26,2"></div></div></div>') },
    { name: 'not_a_story_page', url: 'https://www.instagram.com/alice/', html: story(row([65])) },
    { name: 'stale_container_and_hide_class_moved', url: STORY,
        html: story('<div id="old" class="md-hide-native-segments"><div id="md-story-progress-container"></div></div>' + row([65])) },
    { name: 'second_frame_reuses_cache', url: STORY, html: story(row([130, 65, 0])), frames: 2 },
    { name: 'detached_cache_rescans_same_frame', url: STORY, html: story(row([130, 65, 0])), detachCacheBeforeSecondFrame: true, frames: 2 },
    { name: 'dragging_freezes_slider', url: STORY, html: story(row([65])), dragBeforeSecondFrame: true, changeFillBeforeSecondFrame: ['#fillrow1', 13], frames: 2 },
    { name: 'seek_moves_media_and_animations', url: STORY, html: story(row([130, 65, 0]), video('v1')) + '<div id="outside" rect="900,0,10,10"></div>',
        media: { '#v1': { duration: 10, currentTime: 4 } }, seek: 50,
        animations: [
            { target: '#fillrow2', duration: 5000, playState: 'running' },
            { target: '#fillrow3', duration: 5000, playState: 'finished' },
            { target: '#hdr', duration: 3000, playState: 'running' },
            { target: '#hdr', duration: 1000, playState: 'running' },
            { target: '#hdr', duration: 3000, playState: 'idle' },
            { target: '#outside', duration: 3000, playState: 'running' },
            { target: '#fillrow1', duration: Infinity, playState: 'running' },
        ] },
    { name: 'seek_near_end_does_not_replay', url: STORY, html: story(row([130, 65])), seek: 99.5,
        animations: [{ target: '#fillrow2', duration: 4000, playState: 'finished' }] },
];
