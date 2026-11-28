// Regression: input synthesized by scripts (a former story auto-advance dispatched clicks and
// ArrowRight keydowns; the page itself can too) must never trigger a download. Only real user input
// (Event.isTrusted === true) may reach the download shortcut or the overlay click rescue.
// jsdom cannot create trusted events, so this suite only proves the untrusted path is ignored;
// against the code before the fix both checks fail.
// Usage: node tests/js/synthetic_input.test.js
const { JSDOM } = require('jsdom');
const { loadContentScripts } = require('./helpers/content_scripts.js');

const SHORTCUT = { code: 'ArrowRight', key: 'ArrowRight', display: 'ARROWRIGHT' };

function setUp() {
    const dom = new JSDOM('<!doctype html><html><body><div id="overlay"></div><button class="md-post-btn" id="download"></button></body></html>', {
        url: 'https://www.instagram.com/stories/someone/', runScripts: 'dangerously', pretendToBeVisual: true,
    });
    const { window } = dom;
    window.console.error = () => {};
    window.console.warn = () => {};
    window.chrome = {
        runtime: { id: 'test-extension', lastError: undefined, sendMessage() {}, onMessage: { addListener() {} } },
        storage: {
            local: { get: (_keys, callback) => callback({ globalShortcutObj: SHORTCUT }), set() {} },
            onChanged: { addListener() {} },
        },
    };
    loadContentScripts(window, ['src/shared/utils/shortcut_manager.js', 'src/instagram/main.js']);
    return window;
}

const results = [];
const check = (name, ok) => results.push([ok ? 'PASS' : 'FAIL', name]);

{
    const window = setUp();
    let shortcutFired = 0;
    window.ShortcutManager.onShortcutPressed(() => { shortcutFired++; });
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
    check('1  synthetic keydown matching the shortcut does not trigger a download', shortcutFired === 0);
}
{
    const window = setUp();
    const button = window.document.getElementById('download');
    button.getBoundingClientRect = () => ({ left: 100, right: 200, top: 100, bottom: 200, width: 100, height: 100 });
    let buttonClicks = 0;
    button.addEventListener('click', () => { buttonClicks++; });
    const overlay = window.document.getElementById('overlay');
    overlay.dispatchEvent(new window.MouseEvent('click', { clientX: 150, clientY: 150, bubbles: true, cancelable: true }));
    check('2  synthetic click over a download button is not rescued into a download', buttonClicks === 0);
}

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
