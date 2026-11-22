// Lists, for one content-script group, which top-level names each file uses from the other files
// (what an ES module migration has to import/export) and flags cross-file writes, which ES imports
// cannot do because imported bindings are read-only.
// Usage: node tools/analyze_cross_file_globals.js <groupIndex> [--json]
const fs = require('fs');
const path = require('path');
const espree = require('espree');
const eslintScope = require('eslint-scope');
const globals = require('globals');

const repoRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
const group = manifest.content_scripts[Number(process.argv[2])];
const environment = new Set([...Object.keys(globals.browser), ...Object.keys(globals.webextensions), ...Object.keys(globals.es2021)]);

/** @returns {{ declared: string[], used: Map<string, boolean> }} used: name -> written */
function analyze(file) {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    const isModule = /^\s*(import|export)\s/m.test(source);
    const ast = espree.parse(source, { ecmaVersion: 'latest', sourceType: isModule ? 'module' : 'script', range: true, loc: true });
    const scopeManager = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: isModule ? 'module' : 'script' });
    const topScope = isModule ? scopeManager.globalScope.childScopes[0] : scopeManager.globalScope;
    const declared = topScope.variables.map((variable) => variable.name);
    const used = new Map();
    for (const reference of scopeManager.globalScope.through) {
        const name = reference.identifier.name;
        if (environment.has(name)) continue;
        used.set(name, (used.get(name) || false) || reference.isWrite());
    }
    return { declared, used };
}

const files = group.js.filter((file) => file.startsWith('src/'));
const results = Object.fromEntries(files.map((file) => [file, analyze(file)]));
const owner = {};
for (const [file, { declared }] of Object.entries(results)) for (const name of declared) owner[name] = file;

const report = {};
for (const [file, { used }] of Object.entries(results)) {
    const imports = {};
    const unknown = [];
    const writes = [];
    for (const [name, written] of used) {
        if (!owner[name]) { unknown.push(name); continue; }
        if (owner[name] === file) continue;
        (imports[owner[name]] = imports[owner[name]] || []).push(name);
        if (written) writes.push(`${name} (owned by ${owner[name]})`);
    }
    report[file] = { imports, unknown, writes };
}
if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
} else {
    for (const [file, { imports, unknown, writes }] of Object.entries(report)) {
        const count = Object.values(imports).reduce((total, names) => total + names.length, 0);
        console.log(`${file}  (${count} imported names)`);
        for (const [source, names] of Object.entries(imports)) console.log(`    from ${path.basename(source)}: ${names.join(', ')}`);
        if (writes.length) console.log(`    !! WRITES TO IMPORTED: ${writes.join('; ')}`);
        if (unknown.length) console.log(`    ?? undeclared: ${unknown.join(', ')}`);
    }
}
