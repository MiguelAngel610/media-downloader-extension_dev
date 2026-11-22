// Loads extension content scripts into a jsdom window the way Chrome runs them:
//  - classic scripts (src/shared/utils/*) as real <script> elements, so their top-level names are shared;
//  - ES modules (src/instagram/**) bundled in memory with esbuild into one IIFE, like dist/ig_content.bundle.js.
//    Their exports are copied onto window so tests can call them like the former globals.
// A test that needs to observe a module must do it at a real boundary (chrome.*, window.postMessage,
// the DOM): imported bindings cannot be replaced from outside.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const bundleCache = new Map();

/** @param {string} file - repo-relative path */
function isEsModule(file) {
    return /^\s*(import|export)\s/m.test(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
}

function injectScript(window, source, sourceUrl) {
    const script = window.document.createElement('script');
    script.textContent = `${source}\n//# sourceURL=${sourceUrl}`;
    window.document.head.appendChild(script);
}

/** @param {string[]} modules - repo-relative ES module paths, evaluated in this order */
function bundleModules(modules) {
    const key = modules.join('|');
    if (!bundleCache.has(key)) {
        const specifier = (file) => JSON.stringify(path.join(repoRoot, file).replace(/\\/g, '/'));
        const contents = modules.map((file, i) => `import * as module${i} from ${specifier(file)};`).join('\n')
            + `\nObject.assign(window, ${modules.map((_, i) => `module${i}`).join(', ')});`;
        const result = esbuild.buildSync({
            stdin: { contents, resolveDir: repoRoot, sourcefile: 'content_scripts_test_entry.js' },
            bundle: true, format: 'iife', write: false, logLevel: 'error',
        });
        bundleCache.set(key, result.outputFiles[0].text);
    }
    return bundleCache.get(key);
}

/**
 * @param {Window} window - jsdom window created with runScripts: 'dangerously'
 * @param {string[]} files - repo-relative paths in manifest order (missing files are skipped)
 */
function loadContentScripts(window, files) {
    const existing = files.filter((file) => fs.existsSync(path.join(repoRoot, file)));
    const modules = existing.filter(isEsModule);
    for (const file of existing.filter((candidate) => !modules.includes(candidate))) {
        injectScript(window, fs.readFileSync(path.join(repoRoot, file), 'utf8'), file);
    }
    if (modules.length > 0) injectScript(window, bundleModules(modules), 'ig_content_test.bundle.js');
}

module.exports = { loadContentScripts };
