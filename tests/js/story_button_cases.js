// Inputs for the story button golden master (injectStoryButton + its click handler, jsdom 1024x768).
// rect="left,top,width,height" fakes layout. dots: the 3-dots button Instagram renders in the story header.
// fiber: what the page-world fiber search answers (stored like ig_interceptor_init.js does); undefined = timeout.
const STORY = 'https://www.instagram.com/stories/alice/111/';
const CDN_MP4 = (name) => `https://scontent.cdninstagram.com/o1/v/t16/${name}.mp4?efg=x`;
const CDN_JPG = (name) => `https://scontent.cdninstagram.com/v/t51.2885-15/${name}.jpg?stp=dst-jpg`;
const MPD = '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet/></Period></MPD>';
const DOTS_SVG = '<svg><circle/><circle/><circle/></svg>';
const header = (inner = '') => `<header><div id="bar"><div role="button" id="dots" rect="700,20,24,24">${DOTS_SVG}</div>${inner}</div></header>`;
const storyVideo = (attrs = 'src="blob:https://www.instagram.com/v1"') => `<section id="story">${header()}<video id="media" ${attrs} rect="312,60,400,700"></video></section>`;
const storyImage = (src) => `<section id="story">${header()}<img id="media" src="${src}" rect="312,60,400,700"></section>`;
const OLD = 1700000000;

module.exports = {
    injection: [
        { name: 'svg_three_circles_in_header', url: STORY, html: storyVideo() },
        { name: 'aria_label_fallback', url: STORY,
            html: '<section><header><div id="bar"><button aria-label="Más" id="dots" rect="700,20,24,24">…</button></div></header></section>' },
        { name: 'centered_dots_win', url: STORY,
            html: `<section><header><div><div role="button" id="side" rect="40,20,24,24">${DOTS_SVG}</div></div><div><div role="button" id="dots" rect="520,20,24,24">${DOTS_SVG}</div></div></header></section>` },
        { name: 'zero_size_dots_ignored', url: STORY, html: `<section><header><div role="button" id="dots">${DOTS_SVG}</div></header></section>` },
        { name: 'existing_button_kept', url: STORY,
            html: `<section><header><div id="bar"><div class="md-native-btn md-story-dl-btn-inline" id="old"></div><div role="button" id="dots" rect="700,20,24,24">${DOTS_SVG}</div></div></header></section>` },
        { name: 'orphaned_button_moved', url: STORY,
            html: `<section><header><span><div class="md-native-btn md-story-dl-btn-inline" id="old"></div></span><div id="bar"><div role="button" id="dots" rect="700,20,24,24">${DOTS_SVG}</div></div></header></section>` },
        { name: 'not_a_story_page', url: 'https://www.instagram.com/alice/', html: storyVideo() },
        { name: 'scan_throttled_on_second_call', url: STORY, html: '<section><header></header></section>', secondCall: { appendTo: 'header', html: `<div role="button" id="dots" rect="700,20,24,24">${DOTS_SVG}</div>` } },
        { name: 'story_change_resets_buttons', url: STORY, previousStoryKey: '/stories/bob/222/',
            html: `<section><header><div id="bar"><div class="md-native-btn md-story-dl-btn-inline md-success" id="old" style="opacity:0.5"></div><div role="button" id="dots" rect="700,20,24,24">${DOTS_SVG}</div></div></header></section>` },
    ],
    click: [
        { name: 'dictionary_video_with_dash', url: STORY, html: storyVideo(),
            dictionary: { 111: { url: CDN_MP4('dict_v'), dash_manifest: MPD, username: 'alice', timestamp: OLD, media_id: '111' } } },
        { name: 'dictionary_image_story', url: STORY, html: storyImage(CDN_JPG('thumb_i')),
            dictionary: { 111: { url: CDN_JPG('full_i'), username: 'alice', timestamp: OLD } } },
        { name: 'video_without_dictionary_uses_fiber', url: STORY, html: storyVideo(),
            fiber: { url: CDN_MP4('fiber_v'), dash: MPD, media_id: '555', shortcode: 'STORYCODE1', user: 'alice', time: OLD + 1 } },
        { name: 'fiber_url_encoded_dash', url: STORY, html: storyVideo(),
            fiber: { url: CDN_MP4('fiber_enc'), dash: encodeURIComponent(MPD), user: 'alice', time: OLD + 2 } },
        { name: 'fiber_media_id_merges_dictionary', url: STORY, html: storyVideo(),
            dictionary: { 999: { url: CDN_MP4('by_media_id'), username: 'carol', timestamp: OLD + 3, dash_manifest: MPD } },
            fiber: { url: '', media_id: '999', user: '', time: null } },
        { name: 'dictionary_without_dash_asks_fiber_keeps_url', url: STORY, html: storyVideo(),
            dictionary: { 111: { url: CDN_MP4('dict_nodash'), username: 'alice', timestamp: OLD } },
            fiber: { url: CDN_MP4('fiber_other'), dash: MPD, user: 'alice', time: OLD + 4 } },
        { name: 'fiber_timeout_uses_video_src', url: STORY, html: storyVideo(`src="${CDN_MP4('direct_src')}"`) },
        { name: 'fiber_error_answer', url: STORY, html: storyVideo(), fiber: { error: true } },
        { name: 'video_source_child', url: STORY, html: `<section id="story">${header()}<video id="media" rect="312,60,400,700"><source src="${CDN_MP4('source_tag')}"></video></section>` },
        { name: 'signature_match_in_dictionary', url: STORY, html: storyImage(CDN_JPG('sig_abc_n')),
            dictionary: { 777: { url: CDN_JPG('sig_abc_n') + '&full=1', username: 'dave', timestamp: OLD + 5 } } },
        { name: 'no_media_username_only', url: STORY, html: header(), dictionary: { 111: { username: 'erin' } } },
        { name: 'no_media_no_dictionary', url: STORY, html: header() },
        { name: 'media_found_by_center_scan', url: STORY,
            html: `${header()}<div><img id="far" src="${CDN_JPG('far')}" rect="0,60,300,300"></div><div><img id="near" src="${CDN_JPG('near')}" rect="320,60,380,600"></div>` },
        { name: 'center_scan_tie_prefers_larger', url: STORY,
            html: `${header()}<div><img id="small" src="${CDN_JPG('small')}" rect="300,60,420,300"></div><div><img id="big" src="${CDN_JPG('big')}" rect="302,60,416,700"></div>` },
        { name: 'shared_reel_warning', url: STORY, html: storyImage(CDN_JPG('shared')),
            dictionary: { 111: { url: CDN_JPG('shared'), shared_item: { isReel: true, label: 'Watch full reel', href: 'https://www.instagram.com/reel/SHARED0001/' } } } },
        { name: 'send_throws_error', url: STORY, html: storyImage(CDN_JPG('boom')), dictionary: { 111: { url: CDN_JPG('boom_full'), username: 'alice', timestamp: OLD } }, sendThrows: true },
    ],
};
