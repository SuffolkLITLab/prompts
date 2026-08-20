#!/usr/bin/env node
/* Regression test: BUILT_IN_DEFAULT_API_ENDPOINT is the single runtime definition. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const functionsPath = path.join(ROOT, 'js/functions.js');
const promptsPath = path.join(ROOT, 'js/prompts.js');
const optionsPath = path.join(ROOT, 'js/options.js');

const functionsSource = fs.readFileSync(functionsPath, 'utf8');
const promptsSource = fs.readFileSync(promptsPath, 'utf8');
const optionsSource = fs.readFileSync(optionsPath, 'utf8');
const match = functionsSource.match(/const\s+BUILT_IN_DEFAULT_API_ENDPOINT\s*=\s*'([^']+)'\s*;/);
if (!match) {
  throw new Error('functions.js must contain the authoritative BUILT_IN_DEFAULT_API_ENDPOINT definition.');
}
const canonical = match[1];
if (promptsSource.includes(canonical)) {
  throw new Error('prompts.js must not contain the built-in endpoint literal.');
}
if (optionsSource.includes(`api_base = "${canonical}"`)) {
  throw new Error('options.js exporter must not use the endpoint literal as a replacement marker.');
}
if (!promptsSource.includes('var api_base = get_default_api_endpoint();')) {
  throw new Error('prompts.js must initialize api_base through get_default_api_endpoint().');
}

// Prove the resolver follows an edited constant without needing changes elsewhere.
const fakeEndpoint = 'https://example.invalid/v9/future-endpoint';
const resolverSnippet = functionsSource
  .slice(functionsSource.indexOf('const BUILT_IN_DEFAULT_API_ENDPOINT'), functionsSource.indexOf('function get_api_key_registry'))
  .replace(canonical, fakeEndpoint);
const context = {
  localStorage: { getItem: () => null },
  String
};
vm.createContext(context);
vm.runInContext(`${resolverSnippet}\nresult = get_default_api_endpoint();`, context);
if (context.result !== fakeEndpoint) {
  throw new Error(`Edited built-in endpoint did not flow through resolver: ${context.result}`);
}

// Prove prompts initialization obtains the endpoint from the resolver rather than a literal.
const initLine = promptsSource.match(/var api_base = get_default_api_endpoint\(\);/);
if (!initLine) throw new Error('Could not find resolver-based prompts initialization.');
const initContext = { get_default_api_endpoint: () => fakeEndpoint };
vm.createContext(initContext);
vm.runInContext(initLine[0], initContext);
if (initContext.api_base !== fakeEndpoint) {
  throw new Error('prompts.js initialization did not use the edited built-in endpoint.');
}

console.log('Built-in endpoint single-source regression tests passed.');
