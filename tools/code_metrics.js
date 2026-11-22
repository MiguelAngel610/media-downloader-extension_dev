// Maintainability metrics against ESLint's default thresholds (complexity 20, max-depth 4,
// max-lines-per-function 50, max-lines 300), plus naming checks from the Google JS Style Guide.
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

const root = process.argv[2];
const LIMITS = { complexity: 20, depth: 4, fnLines: 50, fileLines: 300 };
const files = [];
(function collect(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) collect(p);
        else if (e.name.endsWith('.js')) files.push(p);
    }
})(path.join(root, 'src'));

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const BRANCH_TYPES = new Set(['IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'ConditionalExpression', 'CatchClause']);
const DEPTH_TYPES = new Set(['IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'SwitchStatement', 'TryStatement']);

function fnName(node, parent) {
    if (node.id) return node.id.name;
    if (parent && parent.type === 'VariableDeclarator' && parent.id.name) return parent.id.name;
    if (parent && (parent.type === 'Property' || parent.type === 'MethodDefinition') && parent.key) return parent.key.name || parent.key.value;
    if (parent && parent.type === 'AssignmentExpression') return (parent.left.property && parent.left.property.name) || '(assigned)';
    return '(anonymous)';
}

function analyzeFunction(fnNode) {
    let complexity = 1; let maxDepth = 0;
    (function visit(node, depth) {
        if (!node || typeof node.type !== 'string') return;
        if (node !== fnNode && FUNCTION_TYPES.has(node.type)) return; // nested functions are measured on their own
        if (BRANCH_TYPES.has(node.type)) complexity++;
        if (node.type === 'SwitchCase' && node.test) complexity++;
        if (node.type === 'LogicalExpression' && (node.operator === '&&' || node.operator === '||' || node.operator === '??')) complexity++;
        let childDepth = depth;
        if (DEPTH_TYPES.has(node.type)) {
            // `else if` chains count as one level, like ESLint max-depth
            const isElseIf = node.type === 'IfStatement' && node.__isElseIf;
            if (!isElseIf) childDepth = depth + 1;
            maxDepth = Math.max(maxDepth, childDepth);
            if (node.type === 'IfStatement' && node.alternate && node.alternate.type === 'IfStatement') node.alternate.__isElseIf = true;
        }
        for (const key of Object.keys(node)) {
            if (key === 'loc' || key === '__isElseIf') continue;
            const child = node[key];
            if (Array.isArray(child)) child.forEach((c) => visit(c, childDepth));
            else if (child && typeof child.type === 'string') visit(child, childDepth);
        }
    })(fnNode, 0);
    return { complexity, maxDepth, lines: fnNode.loc.end.line - fnNode.loc.start.line + 1, params: fnNode.params.length };
}

const report = []; const perFile = []; const naming = [];
for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (rel.includes('.bundle.')) continue;
    const src = fs.readFileSync(file, 'utf8');
    let ast;
    try {
        ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: rel.includes('instagram/interceptors/') || rel.includes('progress/') ? 'module' : 'script', locations: true, allowHashBang: true });
    } catch (err) {
        console.log(`PARSE ERROR ${rel}: ${err.message}`); continue;
    }
    const fileLines = src.split('\n').length;
    let worst = { complexity: 0, maxDepth: 0, lines: 0 };
    walk.fullAncestor(ast, (node, _state, ancestors) => {
        if (!FUNCTION_TYPES.has(node.type)) return;
        const m = analyzeFunction(node);
        const name = fnName(node, ancestors[ancestors.length - 2]);
        worst = { complexity: Math.max(worst.complexity, m.complexity), maxDepth: Math.max(worst.maxDepth, m.maxDepth), lines: Math.max(worst.lines, m.lines) };
        const violations = [];
        if (m.complexity > LIMITS.complexity) violations.push(`complexity ${m.complexity}`);
        if (m.maxDepth > LIMITS.depth) violations.push(`depth ${m.maxDepth}`);
        if (m.lines > LIMITS.fnLines) violations.push(`${m.lines} lines`);
        if (violations.length) report.push({ rel, name, line: node.loc.start.line, ...m, violations });
    });
    walk.full(ast, (node) => {
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
            const n = node.id.name;
            if (/_[a-z]/.test(n) && !/^[A-Z0-9_]+$/.test(n)) naming.push(`${rel}:${node.loc.start.line} variable '${n}' (snake_case, expected lowerCamelCase)`);
        }
        if (node.type === 'FunctionDeclaration' && node.id && /_[a-z]/.test(node.id.name)) naming.push(`${rel}:${node.loc.start.line} function '${node.id.name}' (expected lowerCamelCase)`);
    });
    if (!/^[a-z0-9_]+\.js$/.test(path.basename(file))) naming.push(`${rel} file name (expected lowercase_with_underscores.js)`);
    perFile.push({ rel, fileLines, ...worst });
}

const over = perFile.filter((f) => f.fileLines > LIMITS.fileLines);
console.log(`Files analyzed: ${perFile.length}   functions over ESLint defaults: ${report.length}   files over ${LIMITS.fileLines} lines: ${over.length}\n`);
console.log('== Functions violating ESLint defaults (worst first)');
report.sort((a, b) => (b.complexity + b.maxDepth * 5 + b.lines / 10) - (a.complexity + a.maxDepth * 5 + a.lines / 10));
for (const r of report) console.log(`  ${(r.rel + ':' + r.line).padEnd(58)} ${String(r.name).slice(0, 28).padEnd(28)} cx=${String(r.complexity).padEnd(4)} depth=${String(r.maxDepth).padEnd(3)} lines=${r.lines}`);
console.log(`\n== Files over ${LIMITS.fileLines} lines`);
for (const f of over.sort((a, b) => b.fileLines - a.fileLines)) console.log(`  ${f.rel.padEnd(58)} ${f.fileLines}`);
console.log(`\n== Naming (Google JS Style Guide): ${naming.length}`);
naming.slice(0, 40).forEach((n) => console.log('  ' + n));
