// React fiber trees covering every branch of the Instagram fiber search (golden master input).
const MPD = '<?xml version="1.0"?><MPD><Period><AdaptationSet mimeType="video/mp4"/></Period></MPD>';
const MPD_B = MPD.replace('video/mp4', 'video/webm');
const TS = 1700049600;
const v = (w, h, tag) => ({ width: w, height: h, type: 101, url: `https://cdn.example/v/${tag}.mp4?w=${w}` });
const img = (w, h, file) => ({ width: w, height: h, url: `https://cdn.example/i/${file}.jpg?stp=p${w}x${h}` });

/** Fiber chain from a list of memoizedProps (element first, root last). */
export function chain(...propsList) {
    let parent = null;
    for (let i = propsList.length - 1; i >= 0; i--) {
        const entry = propsList[i];
        const node = entry && entry.__pending ? { memoizedProps: entry.memo, pendingProps: entry.__pending, return: parent } : { memoizedProps: entry, return: parent };
        parent = node;
    }
    return parent;
}

/** @returns {Array<{ name: string, request: object, element: object, initialData?: object }>} */
export function buildCases() {
    const user = { username: 'alice' };
    const throwing = { get boom() { throw new Error('exotic getter'); } };
    const deep = { code: 'DEEPSHORTCD' };
    let cursor = deep;
    for (let i = 0; i < 18; i++) { cursor.nested = {}; cursor = cursor.nested; }
    cursor.video_versions = [v(1080, 1920, 'too_deep')];
    const cyclic = { code: 'CYCLESHORTC', user, taken_at: TS, image_versions2: { candidates: [img(1080, 1080, 'cyc_n')] } };
    cyclic.self = cyclic;

    return [
        { name: 'image_post', request: {}, element: { fiber: chain({ post: { code: 'IMAGESHORT1', pk: '111', user, taken_at: TS, image_versions2: { candidates: [img(640, 640, 'a_n'), img(1440, 1440, 'a_n')] } } }) } },
        { name: 'video_with_dash', request: {}, element: { fiber: chain({ media: { code: 'VIDEOSHORT1', pk: '222', user, taken_at: TS, video_dash_manifest: MPD, video_versions: [v(720, 1280, 'v1'), v(1080, 1920, 'v2')] } }) } },
        { name: 'carousel_index_given', request: { carouselIndex: 2 }, element: { fiber: chain({ post: { code: 'CAROUSEL001', pk: '300', user, taken_at: TS, carousel_media: [
            { pk: '301', image_versions2: { candidates: [img(1080, 1080, 's1_n')] } },
            { pk: '302', video_versions: [v(1080, 1920, 's2')], video_dash_manifest: MPD } ] } }) } },
        { name: 'carousel_poster_sig', request: { posterSig: 's3_n' }, element: { fiber: chain({ post: { code: 'CAROUSEL002', user, taken_at: TS, carousel_media: [
            { pk: '401', image_versions2: { candidates: [img(1080, 1080, 's1_n')] } },
            { pk: '402', image_versions2: { candidates: [img(1080, 1080, 's2_n')] } },
            { pk: '403', image_versions2: { candidates: [img(640, 640, 's3_n'), img(1080, 1080, 's3_n')] } } ] } }) } },
        { name: 'carousel_id_match', request: {}, element: { fiber: chain({ item: { pk: '502' } }, { post: { code: 'CAROUSEL003', user, taken_at: TS, carousel_media: [
            { pk: '501', image_versions2: { candidates: [img(1080, 1080, 'x1_n')] } },
            { pk: '502', image_versions2: { candidates: [img(1080, 1080, 'x2_n')] } } ] } }) } },
        { name: 'carousel_dash_match', request: {}, element: { fiber: chain({ video: { video_dash_manifest: MPD_B } }, { post: { code: 'CAROUSEL004', user, taken_at: TS, carousel_media: [
            { pk: '601', video_dash_manifest: MPD, video_versions: [v(720, 1280, 'd1')] },
            { pk: '602', video_dash_manifest: MPD_B, video_versions: [v(720, 1280, 'd2')] } ] } }) } },
        { name: 'shortcode_guard_skips_neighbour', request: { shortcode: 'RIGHTSHORT1' }, element: { fiber: chain({ list: [
            { code: 'WRONGSHORT1', user: { username: 'mallory' }, taken_at: TS, video_versions: [v(1080, 1920, 'wrong')] },
            { code: 'RIGHTSHORT1', user, taken_at: TS + 5, video_versions: [v(1080, 1920, 'right')] } ] }) } },
        { name: 'graphql_sidecar', request: { carouselIndex: 2 }, element: { fiber: chain({ shortcode_media: { shortcode: 'SIDECAR0001', owner: { username: 'bob' }, taken_at_timestamp: TS,
            edge_sidecar_to_children: { edges: [{ node: { id: '701', display_url: 'https://cdn.example/i/side1.jpg' } }, { node: { id: '702', display_url: 'https://cdn.example/i/side2.jpg' } }] } } }) } },
        { name: 'article_fallback_for_user_time', request: {}, element: { fiber: chain({ video: { video_versions: [v(1080, 1920, 'portal')] } }),
            article: { fiber: chain({ post: { code: 'PORTALSHRT1', author: { username: 'carol' }, device_timestamp: TS * 1e6 } }) } } },
        { name: 'phase2_dom_props', request: {}, element: { fiber: chain({}), reactProps: { media: { code: 'DOMSHORTCD1', username: 'dave', taken_at: TS, video_versions: [v(720, 1280, 'dom')] } } } },
        { name: 'phase2_parent_dom_props', request: {}, element: { fiber: null, parent: { reactProps: { data: { code: 'PARENTSHRT1', user, taken_at: TS, image_versions2: { candidates: [img(1080, 1080, 'p_n')] } } } } } },
        { name: 'phase3_initial_data', request: {}, element: { fiber: chain({ item: { pk: '909' } }) },
            initialData: { feed: { items: [{ pk: '909', code: 'INITIALDAT1', video_versions: [v(480, 854, 'i1'), v(1080, 1920, 'i2')], video_dash_manifest: MPD }] } } },
        { name: 'nothing_found', request: {}, element: { fiber: chain({ unrelated: { foo: 'bar' } }) } },
        { name: 'poster_sig_no_match_falls_through', request: { posterSig: 'zz_n' }, element: { fiber: chain({ post: { code: 'NOMATCHSHR1', user, taken_at: TS, carousel_media: [
            { pk: '801', image_versions2: { candidates: [img(1080, 1080, 'q1_n')] } } ] } }) } },
        { name: 'depth_limit', request: {}, element: { fiber: chain({ root: deep, user, taken_at: TS }) } },
        { name: 'video_url_and_dash_manifest_fields', request: {}, element: { fiber: chain({ media: { code: 'LEGACYSHRT1', owner: { username: 'erin' }, taken_at: TS, video_url: 'https://cdn.example/v/legacy.mp4', dash_manifest: MPD } }) } },
        { name: 'short_manifest_rejected', request: {}, element: { fiber: chain({ media: { code: 'SHORTMANIF1', user, taken_at: TS, video_dash_manifest: '<MPD/>', video_versions: [v(720, 1280, 'sm')] } }) } },
        { name: 'username_with_space_ignored', request: {}, element: { fiber: chain({ media: { code: 'SPACESHORT1', username: 'Not A Handle', owner: { username: 'frank' }, taken_at: TS, image_versions2: { candidates: [img(1080, 1080, 'sp_n')] } } }) } },
        { name: 'pending_props_differ', request: {}, element: { fiber: chain({ memo: { nothing: true }, __pending: { media: { code: 'PENDINGSHR1', user, taken_at: TS, image_versions2: { candidates: [img(1080, 1080, 'pd_n')] } } } }) } },
        { name: 'throwing_getter_and_cycle', request: {}, element: { fiber: chain({ weird: throwing, post: cyclic }) } },
    ];
}
