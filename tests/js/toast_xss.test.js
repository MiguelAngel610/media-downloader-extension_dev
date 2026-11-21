// Regression test for bug D: HTML injection through toasts. Runs the real toast_manager.js in jsdom.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const [toastPath, popupPath] = process.argv.slice(2);
const PAYLOAD = '<img src=x onerror="window.__pwned=true">';
const results = [];
const check = (name, ok) => results.push([ok ? 'PASS' : 'FAIL', name]);

function createPage(scriptPath) {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
        runScripts: 'outside-only', url: 'https://www.instagram.com/',
    });
    dom.window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    dom.window.eval(fs.readFileSync(scriptPath, 'utf8'));
    return dom.window;
}

(async () => {
    const w = createPage(toastPath);
    const toasts = w.MDToastManager;

    toasts.showError('Host Error: ' + PAYLOAD);
    let toast = w.document.querySelector('.md-toast');
    check('D1 error message with <img onerror> is rendered as text', toast.querySelector('.md-toast-msg img') === null &&
        toast.querySelector('.md-toast-msg').textContent.includes('<img src=x'));

    toasts.showSuccess('✅ Download completed!', 4000, PAYLOAD + '.mp4');
    toast = w.document.querySelector('.md-toast');
    const detail = toast.querySelector('.md-toast-detail');
    check('D2 filename detail is bold text, not markup', detail && detail.tagName === 'STRONG' && detail.querySelector('img') === null &&
        detail.textContent === PAYLOAD + '.mp4');
    check('D3 icon SVG still rendered', toast.querySelector('.md-toast-icon-wrapper svg') !== null);

    toasts.showComplex({ title: PAYLOAD, icon: '⚠️', body: PAYLOAD, action: { label: PAYLOAD, href: 'javascript:window.__pwned=true' } });
    toast = w.document.querySelector('.md-toast-complex');
    const actionEl = toast.querySelector('.md-toast-action-btn');
    check('D4 complex toast title/body/label never create elements from text', toast.querySelectorAll('img').length === 0);
    check('D5 javascript: action URL is dropped (no <a href>)', actionEl && actionEl.tagName === 'DIV' && !actionEl.hasAttribute('href'));

    toasts.showComplex({ title: 'Shared Reel Detected', action: { label: 'Open Full Reel', href: 'https://www.instagram.com/reel/ABC/' } });
    const link = w.document.querySelector('.md-toast-complex a.md-toast-action-btn');
    check('D6 https action URL becomes a safe link', link && link.getAttribute('href') === 'https://www.instagram.com/reel/ABC/' &&
        link.getAttribute('rel') === 'noopener noreferrer' && link.getAttribute('target') === '_blank');

    let actionCalls = 0;
    toasts.showComplex({ title: 't', action: { label: 'Go' }, onAction: () => { actionCalls++; } });
    w.document.querySelector('.md-toast-complex .md-toast-action-btn').click();
    check('D7 onAction still fires on click', actionCalls === 1);

    await new Promise((r) => setTimeout(r, 50));
    check('D8 no injected handler ever ran', w.__pwned !== true);

    // Popup ghost history
    const popupDom = new JSDOM(`<!doctype html><html><body>
        <div id="ghost-history-list"></div></body></html>`, { runScripts: 'outside-only', url: 'chrome-extension://test/popup.html' });
    const pw = popupDom.window;
    const popupSource = fs.readFileSync(popupPath, 'utf8');
    const patternMatch = popupSource.match(/const INSTAGRAM_USERNAME_PATTERN = (\/.*\/);/);
    check('D9 popup defines a strict username pattern', !!patternMatch);
    const pattern = pw.eval(patternMatch[1]);
    check('D10 pattern rejects HTML payload as username', !pattern.test('"><img src=x onerror=alert(1)>'));
    check('D11 pattern accepts real usernames', pattern.test('danyancat') && pattern.test('user.name_1'));
    check('D12 popup history no longer uses innerHTML with usernames', !/historyList\.innerHTML\s*=\s*users/.test(popupSource));

    for (const [status, name] of results) console.log(`${status}  ${name}`);
    const failed = results.filter(([s]) => s === 'FAIL').length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
