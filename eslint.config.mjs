// ESLint flat config (https://eslint.org/docs/latest/use/configure/configuration-files).
// Maintainability limits are ESLint's own defaults: complexity 20, max-depth 4,
// max-lines-per-function 50, max-lines 300. Naming follows the Google JavaScript Style Guide.
//
// The limits are warnings everywhere: a signal to review, not a reason to cut code artificially
// (a long but linear function is fine). Only `complexity` is an error, and only in
// REFACTORED_MODULES, so a module that was untangled cannot silently regress: add a file there in
// the same commit that refactors it. Setting just the severity keeps the options above (ESLint docs).
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';

const MAINTAINABILITY_RULES = {
    complexity: ['warn', 20],
    'max-depth': ['warn', 4],
    'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],
    'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
};

const REFACTORED_MODULES = [
    'src/background/**/*.js',
    'src/shared/utils/error_reporter.js',
    'src/shared/utils/toast_manager.js',
    'src/instagram/interceptors/ghost/ghost_policy.js',
    'src/instagram/interceptors/ghost/ghost_settings.js',
    'src/instagram/interceptors/network/request_body.js',
    'src/instagram/interceptors/media/media_quality.js',
    'src/instagram/interceptors/media/fiber_search.js',
    'src/instagram/interceptors/media/fiber/*.js',
    'src/instagram/interceptors/media/profile_pic_collector.js',
    'src/instagram/interceptors/shared/time_utils.js',
    'src/instagram/utils/pfp_resolver.js',
    'src/instagram/download/*.js',
    'src/instagram/media_resolution/*.js',
    'src/instagram/stories/*.js',
    'src/instagram/features/story_button.js',
    'src/instagram/features/progress/story.js',
    'src/instagram/features/progress/story/*.js',
    'src/instagram/utils/media_resolver.js',
    'src/instagram/ui/button_state.js',
];

// Instagram is written as ES modules bundled by esbuild: the page-world interceptor
// (dist/ig_interceptor.bundle.js) and the content script (dist/ig_content.bundle.js).
const ES_MODULES = ['src/instagram/**/*.js'];

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
            ...MAINTAINABILITY_RULES,
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
    { files: REFACTORED_MODULES, rules: { complexity: 'error' } },
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
