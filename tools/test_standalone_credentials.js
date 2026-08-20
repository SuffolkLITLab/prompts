#!/usr/bin/env node
/* Regression checks for standalone credential recovery and persistence. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const functionsSource = fs.readFileSync(path.join(ROOT, 'js', 'functions.js'), 'utf8');
const promptsSource = fs.readFileSync(path.join(ROOT, 'js', 'prompts.js'), 'utf8');
const optionsSource = fs.readFileSync(path.join(ROOT, 'js', 'options.js'), 'utf8');

const start = functionsSource.indexOf('function normalize_api_endpoint');
const end = functionsSource.indexOf('function loadFile', start);
if (start < 0 || end < 0) throw new Error('Credential helper block not found.');

const store = new Map();
const localStorage = {
  getItem(key) { return store.has(key) ? store.get(key) : null; },
  setItem(key, value) { store.set(key, String(value)); },
  removeItem(key) { store.delete(key); }
};
const context = { console, localStorage };
vm.createContext(context);
vm.runInContext("const BUILT_IN_DEFAULT_API_ENDPOINT = 'https://api.openai.com/v1/responses';\n" + functionsSource.slice(start, end), context);

const endpoint = 'https://api.openai.com/v1/responses';
store.set('api_keys', JSON.stringify({ [endpoint]: 'sk-user-saved' }));
context.api_keys = undefined;
let merged = context.merge_api_key_defaults({ [endpoint]: '' });
assert.strictEqual(merged[endpoint], 'sk-user-saved', 'Blank embedded key must not override a saved standalone key.');

store.set('api_keys', JSON.stringify({ [endpoint]: '' }));
context.api_keys = undefined;
merged = context.merge_api_key_defaults({ [endpoint]: 'sk-embedded' });
assert.strictEqual(merged[endpoint], 'sk-embedded', 'Embedded nonblank key should fill a missing/blank saved key.');

store.set('api_keys', JSON.stringify({ [endpoint]: 'sk-replacement' }));
context.api_keys = undefined;
merged = context.merge_api_key_defaults({ [endpoint]: 'sk-old-exported' });
assert.strictEqual(merged[endpoint], 'sk-replacement', 'A user-updated key must win over an older embedded export key after reload.');

assert(optionsSource.includes('var api_keys = merge_api_key_defaults(${safeInlineJson(exportRegistry)});'), 'Unencrypted exports must merge embedded keys as defaults.');
assert(optionsSource.includes('api_keys = merge_api_key_defaults(embedded_api_keys);'), 'Encrypted exports must merge decrypted keys as defaults.');
assert(promptsSource.includes('//FOR EXPORT: clear_popup_output();\n  //FOR EXPORT: location.reload();\n  //FOR EXPORT: return;'), 'Standalone Save Credentials must clear the failed run and return Home.');

console.log('Standalone credential recovery regression tests passed.');
