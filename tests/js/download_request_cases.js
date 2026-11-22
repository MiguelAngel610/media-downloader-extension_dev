// Inputs for the sendDownloadRequest golden master (Instagram content script, jsdom).
const TS = 1700049600;
const CDN = 'https://scontent.cdninstagram.com/v/t51.2885-15/123456_789_n.jpg?stp=dst-jpg_e35';
const article = (inner) => `<article id="post">${inner}</article>`;
const header = '<header><a href="/alice/"><img alt="alice\'s profile picture" src="x.jpg"></a><a href="/alice/">alice</a></header>';
const timeLink = (code) => `<a href="/p/${code}/"><time datetime="2023-11-14T10:00:00.000Z">1d</time></a>`;

/**
 * button: 'in-article' (button inside the post), 'overlay' (detached clone in the overlay root, original in the post),
 *         'story' (inline story button)
 */
module.exports = [
    { name: 'feed_media_id_wins', url: 'https://www.instagram.com/', html: article(header + timeLink('POSTCODE001')), button: 'in-article',
        mediaUrl: CDN, metadata: { username: 'alice', timestamp: TS, media_id: '3123456789012345678_42' } },
    { name: 'feed_username_from_dom', url: 'https://www.instagram.com/', html: article(header + timeLink('POSTCODE002')), button: 'overlay',
        mediaUrl: CDN, metadata: { timestamp: TS, shortcode: 'POSTCODE002' } },
    { name: 'numeric_shortcode_closest_anchor', url: 'https://www.instagram.com/', html: article('<a id="grid" href="/p/GRIDCODE01/"><span id="orig"></span></a>'), button: 'overlay', origin: 'orig',
        mediaUrl: CDN, metadata: { username: 'bob', timestamp: TS, shortcode: '31234567' } },
    { name: 'long_dashed_shortcode_trimmed', url: 'https://www.instagram.com/', html: article('<a href="/reel/ABCDEFGHIJKLMNOPQ-xyz/"><span id="orig"></span></a>'), button: 'overlay', origin: 'orig',
        mediaUrl: CDN, metadata: { username: 'bob', timestamp: TS } },
    { name: 'shortcode_from_article_links', url: 'https://www.instagram.com/', html: article(header + '<a href="/reels/REELCODE01/">c</a>'), button: 'in-article',
        mediaUrl: CDN, metadata: { username: 'carol', timestamp: TS } },
    { name: 'shortcode_from_location', url: 'https://www.instagram.com/p/LOCATIONCD1/', html: article(header), button: 'in-article',
        mediaUrl: CDN, metadata: { username: 'dave', timestamp: TS } },
    { name: 'story_location_id', url: 'https://www.instagram.com/stories/erin/3123456789012345678/', html: '<section id="story"></section>', button: 'story',
        mediaUrl: CDN, metadata: { username: 'erin', timestamp: TS } },
    { name: 'long_shortcode_dropped', url: 'https://www.instagram.com/', html: '<div id="plain"></div>', button: 'overlay',
        mediaUrl: CDN, metadata: { username: 'frank', timestamp: TS, shortcode: 'THIS_IS_TOO_LONG_TO_BE_REAL' } },
    { name: 'timestamp_from_time_element', url: 'https://www.instagram.com/', html: article(header + timeLink('TIMECODE01')), button: 'in-article',
        mediaUrl: CDN, metadata: { username: 'alice', shortcode: 'TIMECODE01' } },
    { name: 'media_id_from_url_filename', url: 'https://www.instagram.com/', html: article(timeLink('FILECODE01')), button: 'in-article',
        mediaUrl: 'https://cdn.example/v/t51/987654_321_n.jpg?x=1', metadata: { username: 'gina', timestamp: TS, shortcode: 'FILECODE01' } },
    { name: 'blob_story_with_id_in_url', url: 'https://www.instagram.com/stories/hank/3123456789012345678/', html: '<section></section>', button: 'story',
        mediaUrl: 'blob:https://www.instagram.com/a', metadata: { username: 'hank', timestamp: TS } },
    { name: 'blob_story_user_and_media_id', url: 'https://www.instagram.com/stories/ivy/', html: '<section></section>', button: 'story',
        mediaUrl: 'blob:https://www.instagram.com/b', metadata: { username: 'ivy', timestamp: TS, media_id: '3111111111111111111_7' } },
    { name: 'blob_story_user_only', url: 'https://www.instagram.com/stories/jack/', html: '<section></section>', button: 'story',
        mediaUrl: 'blob:https://www.instagram.com/c', metadata: { username: 'jack', timestamp: TS } },
    { name: 'blob_post_with_shortcode', url: 'https://www.instagram.com/', html: article(timeLink('BLOBPOST01')), button: 'in-article',
        mediaUrl: 'blob:https://www.instagram.com/d', metadata: { username: 'kate', timestamp: TS, shortcode: 'BLOBPOST01' } },
    { name: 'blob_post_shortcode_from_location', url: 'https://www.instagram.com/reel/LOCREEL001/', html: '<div id="plain"></div>', button: 'overlay',
        mediaUrl: 'blob:https://www.instagram.com/e', metadata: { username: 'liam', timestamp: TS, shortcode: 'THIS_IS_TOO_LONG_TO_BE_REAL' } },
    { name: 'blob_unresolvable_aborts', url: 'https://www.instagram.com/explore/', html: '<div id="plain"></div>', button: 'overlay',
        mediaUrl: 'blob:https://www.instagram.com/f', metadata: { username: 'mia', timestamp: TS, shortcode: 'THIS_IS_TOO_LONG_TO_BE_REAL' } },
    { name: 'blob_with_dash_is_direct', url: 'https://www.instagram.com/', html: article(timeLink('DASHCODE01')), button: 'in-article',
        mediaUrl: 'blob:https://www.instagram.com/g', metadata: { username: 'noah', timestamp: TS, shortcode: 'DASHCODE01', dash_manifest: '<MPD>x</MPD>' } },
    { name: 'carousel_delegated_media_type', url: 'https://www.instagram.com/', html: article(timeLink('CAROUSEL01')), button: 'in-article',
        mediaUrl: 'https://www.instagram.com/p/CAROUSEL01/', metadata: { shortcode: 'CAROUSEL01', media_category: 'post', mediaType: 'auto', index: 2 } },
    { name: 'host_rejects_request', url: 'https://www.instagram.com/', html: article(header + timeLink('ERRCODE001')), button: 'in-article',
        mediaUrl: CDN, metadata: { username: 'alice', timestamp: TS, shortcode: 'ERRCODE001' }, response: { status: 'error', message: 'Python host is not installed' } },
    { name: 'extension_context_invalidated', url: 'https://www.instagram.com/', html: article(header), button: 'in-article',
        mediaUrl: CDN, metadata: { username: 'alice', timestamp: TS }, runtimeId: null },
    { name: 'account_v_and_null_metadata', url: 'https://www.instagram.com/p/NULLMETA01/', html: article(header + timeLink('NULLMETA01')), button: 'in-article',
        mediaUrl: CDN, metadata: null, account: 'V' },
    { name: 'story_changed_before_response', url: 'https://www.instagram.com/stories/olga/3123456789012345678/', html: '<section></section>', button: 'story',
        mediaUrl: CDN, metadata: { username: 'olga', timestamp: TS }, navigateTo: 'https://www.instagram.com/stories/olga/3999999999999999999/' },
];
