#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const options = fs.readFileSync(path.join(ROOT, 'js', 'options.js'), 'utf8');
const popup = fs.readFileSync(path.join(ROOT, 'js', 'popup.js'), 'utf8');
const prompts = fs.readFileSync(path.join(ROOT, 'js', 'prompts.js'), 'utf8');
const platform = fs.readFileSync(path.join(ROOT, 'js', 'platform.js'), 'utf8');
const exported = fs.readFileSync(path.join(ROOT, 'js', 'popup_exported.js'), 'utf8');

// Settings schema/UI.
assert(options.includes("createParameterInput('Run in New Tab ', 'run_in_new_tab'"), 'Run in New Tab control missing');
assert(options.indexOf('promptListing.appendChild(hideButtonsCheckbox);') < options.indexOf('promptListing.appendChild(runInNewTabCheckbox);'), 'Run in New Tab must follow Hide Button');
assert(options.includes("const run_in_new_tab = !!(runInNewTabInput && runInNewTabInput.checked);"), 'Run in New Tab not persisted');
assert(options.includes('run_in_new_tab: run_in_new_tab'), 'Run in New Tab missing from saved template record');
assert(options.includes('runInput.disabled = hidden;'), 'Run in New Tab should disable when Hide Button is checked');
assert(options.includes('only applies to buttons launched from Home'), 'Run in New Tab help should explain Home-only behavior');

// Launch semantics: toolbar Home may open a tab; an interaction tab never nests another one.
assert(popup.includes('templateRunsInNewTab(choice) && !isPersistentInteractionTab()'), 'Home launch guard missing');
assert(popup.includes("LitPlatform.getURL('popup.html') + '?mode=tab&run='"), 'Persistent tab URL missing');
assert(popup.includes('await LitPlatform.createTab({ url: url, active: true });'), 'Persistent tab creation missing');
assert(popup.indexOf('clear_popup_output();', popup.indexOf('async function launchPromptInNewInteractionTab')) < popup.indexOf('await LitPlatform.createTab({ url: url, active: true });'), 'Toolbar popup must reset before activating the new tab');
assert(popup.includes('window.close();'), 'Toolbar popup should explicitly close after a successful tab launch when still alive');
assert(popup.includes('sourceTabId:'), 'Source tab ID must be handed off');
assert(popup.includes('innerHTML: bodyHTML'), 'Captured page HTML must be handed off');
assert(popup.includes('interaction_launch_is_pending'), 'One-time launch marker missing');

// Per-tab persistence and reload context isolation.
assert(prompts.includes("baseKey + ':' + interaction_tab_scope"), 'Interaction-tab storage is not scoped');
assert(prompts.includes("sessionStorage.setItem(interaction_context_session_key, launchRaw)"), 'Interaction context is not preserved per tab across reload');
assert(prompts.includes("localStorage.getItem(interaction_launch_storage_key)"), 'One-time launch handoff missing');
assert(prompts.includes("prompt_context_tab_id"), 'Original source-tab identity missing');
assert(prompts.includes("await LitPlatform.getTab(prompt_context_tab_id)"), 'JavaScript templates should target the original source tab');
assert(prompts.includes("await LitPlatform.closeCurrentTab()"), 'CLOSE POP-UP / SAVE TO FILE should close an interaction tab');

// Shared platform layer keeps Firefox/Chrome source identical.
assert(platform.includes('async function createTab(createProperties)'), 'Shared createTab platform helper missing');
assert(platform.includes('async function closeCurrentTab()'), 'Shared closeCurrentTab platform helper missing');
assert(platform.includes('getTab: getTab'), 'Shared getTab platform helper missing');

// Standalone HTML is already a persistent page and should ignore the extension-only launch preference.
assert(!exported.includes('run_in_new_tab'), 'Standalone exports should not spawn extension interaction tabs');

// Backward compatibility: missing field is false.
const start = popup.indexOf('function templateRunsInNewTab(choice)');
const end = popup.indexOf('function makeInteractionTabScope()', start);
const fnSource = popup.slice(start, end);
const ctx = { templates: { old: {}, yes: { run_in_new_tab: true }, one: { run_in_new_tab: '1' } } };
vm.createContext(ctx);
vm.runInContext(fnSource, ctx);
assert.strictEqual(ctx.templateRunsInNewTab('old'), false);
assert.strictEqual(ctx.templateRunsInNewTab('yes'), true);
assert.strictEqual(ctx.templateRunsInNewTab('one'), true);

console.log('Run-in-new-tab regression tests passed.');
