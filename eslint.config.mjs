// ESLint flat config (https://eslint.org/docs/latest/use/configure/configuration-files).
// Maintainability limits are ESLint's own defaults: complexity 20, max-depth 4,
// max-lines-per-function 50, max-lines 300. Naming follows the Google JavaScript Style Guide.
//
// Legacy code reports these limits as warnings (a measurable debt baseline).
// Every module listed in REFACTORED_MODULES enforces them as errors so it can never regress:
// add a file there in the same commit that refactors it.
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';

const MAINTAINABILITY_LIMITS = {
    complexity: 20,
    'max-depth': 4,
    'max-lines-per-function': { max: 50, skipBlankLines: true, skipComments: true },
    'max-lines': { max: 300, skipBlankLines: true, skipComments: true },
};

/** @param {'warn' | 'error'} level */
const maintainabilityRules = (level) => Object.fromEntries(
    Object.entries(MAINTAINABILITY_LIMITS).map(([rule, option]) => [rule, [level, option]]),
);

const REFACTORED_MODULES = [
    'src/background/**/*.js',
    'src/shared/utils/error_reporter.js',
    'src/shared/utils/toast_manager.js',
    'src/instagram/interceptors/core/ghost_policy.js',
    'src/instagram/interceptors/core/ghost_settings.js',
    'src/instagram/interceptors/core/request_body.js',
    'src/instagram/interceptors/core/media_quality.js',
    'src/instagram/interceptors/core/profile_pic_collector.js',
    'src/instagram/interceptors/core/time_utils.js',
    'src/instagram/utils/pfp_resolver.js',
];

// Page-world (MAIN) modules bundled by esbuild into dist/*.bundle.js.
const ES_MODULES = [
    'src/instagram/interceptors/**/*.js',
    'src/instagram/features/progress/**/*.js',
];

export default defineConfig([
    { ignores: ['dist/**', 'node_modules/**', '.trash/**', 'host/**', 'tests/fixtures/**'] },
    js.configs.recommended,
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: { ...globals.browser, ...globals.webextensions },
        },
        rules: {
            ...maintainabilityRules('warn'),
            camelcase: ['error', { properties: 'never', ignoreDestructuring: true, ignoreImports: true }],
            'no-empty': ['error', { allowEmptyCatch: false }],
            'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'all', argsIgnorePattern: '^_' }],
            eqeqeq: ['error', 'smart'],
            'prefer-const': 'warn',
            'no-var': 'error',
        },
    },
    { files: ES_MODULES, languageOptions: { sourceType: 'module' } },
    { files: ['src/background/**/*.js'], languageOptions: { globals: { ...globals.serviceworker, ...globals.webextensions } } },
    { files: REFACTORED_MODULES, rules: maintainabilityRules('error') },
    // Tooling and tests run in Node. .js files are CommonJS (package.json "type": "commonjs"); .mjs are ES modules.
    // Tests also simulate the page, so browser globals are allowed there.
    {
        files: ['tests/**/*.js', 'tools/**/*.js'],
        languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
    },
    {
        files: ['tests/**/*.mjs', 'eslint.config.mjs'],
        languageOptions: { sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    },
]);
