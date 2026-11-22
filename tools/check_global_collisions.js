// Classic content scripts listed in one manifest group share a single global scope: a top-level
// const/let/class declared twice makes Chrome throw a SyntaxError and skip the whole second file.
// This lists every duplicated top-level name per content-script group (exit 1 when any is found).
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const root = path.resolve(process.argv[2] || '.');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

/** @returns {string[]} names declared at the top level of a classic script */
function topLevelNames(file) {
    const ast = acorn.parse(fs.readFileSync(path.join(root, file), 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' });
    const names = [];
    for (const node of ast.body) {
        if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) names.push(node.id.name);
        if (node.type === 'VariableDeclaration') {
            for (const declaration of node.declarations) if (declaration.id.type === 'Identifier') names.push(declaration.id.name);
        }
    }
    return names;
}

let collisions = 0;
for (const group of manifest.content_scripts) {
    if (group.world === 'MAIN') continue;
    const owners = new Map();
    for (const file of group.js.filter((f) => !f.startsWith('dist/'))) {
        for (const name of topLevelNames(file)) {
            if (!owners.has(name)) owners.set(name, []);
            owners.get(name).push(file);
        }
    }
    for (const [name, files] of owners) {
        if (files.length < 2) continue;
        collisions++;
        console.log(`COLLISION [${group.matches[0]}] '${name}' declared in: ${files.join(', ')}`);
    }
}
console.log(collisions ? `\n${collisions} collision(s)` : 'No top-level name collisions in any content-script group');
process.exit(collisions ? 1 : 0);
