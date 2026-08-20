#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const prompts = fs.readFileSync(path.join(ROOT, 'js', 'prompts.js'), 'utf8');
const popup = fs.readFileSync(path.join(ROOT, 'js', 'popup.js'), 'utf8');
const exported = fs.readFileSync(path.join(ROOT, 'js', 'popup_exported.js'), 'utf8');

assert(prompts.includes('function resetDebugLogState()'), 'Shared debug reset helper missing');
assert(prompts.includes('function start_new_popup_run()'), 'Explicit new-run helper missing');
assert(prompts.includes("localStorage.removeItem(popup_output_storage_key);"), 'New-run path must clear stale transcript persistence');
assert(prompts.includes("localStorage.removeItem(popup_session_storage_key);"), 'New-run path must clear stale session/log persistence');
assert(prompts.includes("resetDebugLogState();"), 'Clear/new-run path must reset rendered/in-memory logs');
assert(prompts.includes("current_run_id = 'run_'"), 'Fresh run identifier missing');
assert(prompts.includes('current_run_id: current_run_id'), 'Run identifier must persist with session');
assert(popup.includes('start_new_popup_run();\n          choose_prompt(choice);'), 'Extension Home prompt buttons must start a fresh run');
assert(exported.includes('start_new_popup_run();\n        choose_prompt(this.dataset.choice);'), 'Exported Home prompt buttons must start a fresh run');
// Internal chains should remain in the current run and must not call the fresh-run helper.
const postRun = prompts.slice(prompts.indexOf('// Behavior'), prompts.indexOf('\n}\n', prompts.indexOf('// Behavior')) + 3);
assert(!postRun.includes('start_new_popup_run()'), 'Prompt handoffs must not reset the current run');
console.log('Log run-boundary regression tests passed.');
