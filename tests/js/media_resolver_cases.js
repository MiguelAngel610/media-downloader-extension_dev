// Inputs for the resolveMediaUrl golden master (Instagram content script, jsdom).
// media: CSS selector of the element passed as `media`; article: selector of the `article` argument.
// rect="left,top,width,height" fakes getBoundingClientRect (jsdom has no layout).
// fiber: what the page-world bridge stores in window.__md_fiberResults (undefined = no answer -> timeout).
const IMG = (file) => `https://scontent.cdninstagram.com/v/t51.2885-15/${file}.jpg?stp=dst-jpg_e35`;
const MP4 = (file) => `https://scontent.cdninstagram.com/o1/v/t16/${file}.mp4?efg=x`;
const fiberImage = { url: IMG('fib_1'), dash_manifest: '', media_id: '311', index: 2, shortcode: 'FIBERCODE1', user: 'alice', time: 1700049600 };

module.exports = [
    { name: 'img_with_fiber_result', html: `<article id="a"><a href="/p/LINKCODE01/">t</a><img id="m" src="${IMG('poster_a')}"></article>`,
        media: '#m', article: '#a', fiber: fiberImage },
    { name: 'video_poster_signature', html: `<article id="a"><video id="m" poster="${IMG('poster_v')}" src="blob:https://www.instagram.com/1"></video></article>`,
        media: '#m', article: '#a', fiber: { url: MP4('v1'), dash_manifest: '<MPD/>', media_id: '322', shortcode: 'VIDCODE001', user: 'bob', time: 1700049601 } },
    { name: 'video_http_src_signature', html: `<article id="a"><video id="m" src="${MP4('direct_src')}"></video></article>`,
        media: '#m', article: '#a', fiber: { url: MP4('v2'), dash_manifest: '', user: 'bob', time: 1700049602 } },
    { name: 'video_sibling_img_in_parent', html: `<article id="a"><div><img src="${IMG('sibling_p')}"><video id="m" src="blob:x"></video></div></article>`,
        media: '#m', article: '#a', fiber: fiberImage },
    { name: 'video_img_in_grandparent', html: `<article id="a"><div><img src="${IMG('sibling_gp')}"><div><video id="m" src="blob:x"></video></div></div></article>`,
        media: '#m', article: '#a', fiber: fiberImage },
    { name: 'video_img_in_slide', html: `<article id="a"><ul><li><div><div><div><video id="m" src="blob:x"></video></div></div></div><span><img src="${IMG('slide_img')}"></span></li></ul></article>`,
        media: '#m', article: '#a', fiber: fiberImage },
    { name: 'video_without_any_signature', html: `<article id="a"><video id="m" src="blob:x"></video></article>`,
        media: '#m', article: '#a', fiber: fiberImage },
    { name: 'known_shortcode_wins', html: `<article id="a"><a href="/p/LINKCODE01/">t</a><img id="m" src="${IMG('k')}"></article>`,
        media: '#m', article: '#a', knownShortcode: 'KNOWNCODE1', carouselIndex: 3, fiber: fiberImage },
    { name: 'centered_link_selected', html: `<article id="a"><a href="/p/FARCODE001/" rect="0,0,10,10">far</a><a href="/reel/NEARCODE01/" rect="500,380,20,10">near</a><img id="m" src="${IMG('c')}"></article>`,
        media: '#m', article: '#a', fiber: { url: IMG('c_full'), media_id: '333', user: 'carol', time: 1700049603 } },
    { name: 'reel_link_with_query', html: `<article id="a"><a href="/reel/REELQUERY1/?igsh=abc">r</a><img id="m" src="${IMG('r')}"></article>`,
        media: '#m', article: '#a', fiber: { url: IMG('r_full'), user: 'dave', time: 1700049604 } },
    { name: 'fiber_dash_only', html: `<article id="a"><video id="m" poster="${IMG('d')}"></video></article>`,
        media: '#m', article: '#a', fiber: { url: '', dash_manifest: '<MPD>d</MPD>', media_id: '344', shortcode: 'DASHONLY01', user: 'erin', time: 1700049605 } },
    { name: 'fiber_error_falls_back_to_dictionary', html: `<article id="a"><a href="/p/DICTCODE01/">t</a><img id="m" src="${IMG('e')}"></article>`,
        media: '#m', article: '#a', fiber: { error: true },
        dictionary: { 1: { shortcode: 'DICTCODE01', url: IMG('dict_e'), username: 'frank', timestamp: 1700049606 } } },
    { name: 'fiber_timeout_dictionary_single', html: `<article id="a"><a href="/p/DICTCODE02/">t</a><img id="m" src="${IMG('f')}"></article>`,
        media: '#m', article: '#a',
        dictionary: { 1: { shortcode: 'OTHERCODE1', url: IMG('other') }, 2: { code: 'DICTCODE02', url: MP4('dict_vid'), username: 'gina', timestamp: 1700049607 } } },
    { name: 'dictionary_carousel_img_index', url: 'https://www.instagram.com/p/DICTCODE03/?img_index=2', html: `<article id="a"><a href="/p/DICTCODE03/">t</a><img id="m" src="${IMG('g')}"></article>`,
        media: '#m', article: '#a',
        dictionary: { 1: { shortcode: 'DICTCODE03', url: IMG('slide1') }, 2: { shortcode: 'DICTCODE03', url: IMG('slide2'), dash_manifest: '<MPD>s2</MPD>' } } },
    { name: 'dictionary_carousel_li_index', html: `<article id="a"><a href="/p/DICTCODE04/">t</a><ul><li>0</li><li><img id="m" src="${IMG('h')}"></li></ul></article>`,
        media: '#m', article: '#a',
        dictionary: { 1: { shortcode: 'DICTCODE04', url: IMG('li0') }, 2: { shortcode: 'DICTCODE04', url: IMG('li1'), timestamp: 1700049608 } } },
    { name: 'dictionary_without_shortcode_takes_first', html: `<div id="a"><img id="m" src="${IMG('i')}"></div>`,
        media: '#m', article: null,
        dictionary: { 1: { shortcode: 'FIRSTCODE1', url: IMG('first') }, 2: { shortcode: 'SECONDCD01', url: IMG('second') } } },
    { name: 'nothing_anywhere', html: `<article id="a"><img id="m" src="${IMG('j')}"></article>`,
        media: '#m', article: '#a', dictionary: {} },
    { name: 'media_null', html: '<article id="a"></article>', media: null, article: '#a', fiber: fiberImage },
    { name: 'relative_poster_signature_fallback', html: `<article id="a"><img id="m" src="${IMG('rel')}"></article>`,
        media: '#m', article: '#a', overrideSrc: 'not a url /x/rel_sig.webp', fiber: fiberImage },
];
