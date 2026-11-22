// Inputs for the detectSharedReelOrPost golden master (story viewer, jsdom 1024x768).
// rect="left,top,width,height" fakes layout; elements without rect sit at x=0 (outside the story column).
const STORY_URL = 'https://www.instagram.com/stories/alice/3123456789012345678/';
const toast = '<div id="md-reel-warning-toast">old warning</div>';

module.exports = [
    { name: 'dictionary_ground_truth', url: STORY_URL, html: '',
        dictionary: { "3123456789012345678": { shared_item: { isReel: true, label: '@creator', href: 'https://www.instagram.com/reel/SHAREDREEL1/' } } } },
    { name: 'dictionary_without_shared_item', url: STORY_URL, html: toast, dictionary: { "3123456789012345678": { url: 'x' } } },
    { name: 'centered_reel_link', url: STORY_URL, html: '<a href="/reel/REELCODE01/" rect="450,300,120,30">Watch full reel</a>' },
    { name: 'post_link_without_text', url: STORY_URL, html: '<a href="/p/POSTCODE01/" rect="450,300,120,30"></a>' },
    { name: 'tv_link_is_reel', url: STORY_URL, html: '<a href="/tv/TVCODE0001/" rect="450,300,120,30">IGTV</a>' },
    { name: 'link_in_extension_ui_ignored', url: STORY_URL, html: '<div class="md-toast"><a href="/p/OURS000001/" rect="450,300,120,30">ours</a></div>' },
    { name: 'hidden_link_skipped_next_used', url: STORY_URL,
        html: '<a href="/p/HIDDEN0001/" rect="450,300,120,30" style="visibility:hidden">hidden</a><a href="/reel/VISIBLE001/" rect="450,350,120,30">Watch</a>' },
    { name: 'link_outside_story_column', url: STORY_URL, html: toast + '<a href="/p/SIDECODE01/" rect="10,300,120,30">side</a>' },
    { name: 'zero_width_link_uses_left', url: STORY_URL, html: '<a href="/p/ZEROWIDTH1/" rect="512,300,0,30">x</a>' },
    { name: 'link_below_viewport_ignored', url: STORY_URL, html: toast + '<a href="/p/BELOW00001/" rect="450,900,120,30">below</a>' },
    { name: 'text_badge_spanish_with_link', url: STORY_URL, html: '<a href="https://www.instagram.com/reels/abc/" style="display:block"><span rect="450,400,140,20">Ver reel completo</span></a>' },
    { name: 'text_badge_view_photo_no_link', url: STORY_URL, html: '<div rect="450,400,140,20">View photo</div>' },
    { name: 'text_badge_hidden_skipped', url: STORY_URL, html: toast + '<div rect="450,400,140,20" style="opacity:0">See post</div>' },
    { name: 'text_badge_too_many_children', url: STORY_URL, html: toast + '<div rect="450,400,140,20"><b>See</b><b> </b><b>post</b></div>' },
    { name: 'attribution_in_story_body', url: STORY_URL, html: '<div role="button" id="clickable"><span rect="470,300,80,18">@original_creator</span></div>' },
    { name: 'attribution_in_header_ignored', url: STORY_URL, html: toast + '<span rect="470,50,80,18">@alice</span>' },
    { name: 'attribution_with_space_ignored', url: STORY_URL, html: toast + '<span rect="470,300,80,18">@not a handle</span>' },
    { name: 'nothing_removes_outdated_toast', url: STORY_URL, html: toast + '<p>Just a photo story</p>' },
    { name: 'detection_keeps_toast', url: STORY_URL, html: toast + '<a href="/p/KEEPTOAST1/" rect="450,300,120,30">See post</a>' },
    { name: 'story_url_without_id', url: 'https://www.instagram.com/stories/alice/', html: '',
        dictionary: { "3123456789012345678": { shared_item: { isReel: false, label: 'See Post', href: null } } } },
];
