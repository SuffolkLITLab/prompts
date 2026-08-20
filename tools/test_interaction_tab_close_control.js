#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const prompts = fs.readFileSync(path.join(ROOT, 'js', 'prompts.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8');

// Base markup remains backward-compatible for normal popup / standalone use.
assert(html.includes('<button id="restartButton">Back Home</button>'), 'Base Back Home control missing');

// Persistent interaction tabs relabel every terminal/recovery control and close the tab.
assert(prompts.includes("var label = interaction_tab_mode ? 'CLOSE' : 'Back Home';"), 'Context-aware terminal label missing');
assert(prompts.includes('function activateTerminalControl()'), 'Shared terminal activation helper missing');
assert(prompts.includes('if (interaction_tab_mode) {\n      clear_and_close_popup();'), 'Interaction-tab terminal control must clear and close');
assert(prompts.includes("[\"restartButton\", \"restartButton_companion\", \"restartButton_companion_chat\"]"), 'All terminal companion controls must be relabeled');
assert(prompts.includes("restart.textContent = interaction_tab_mode ? 'CLOSE' : 'Back Home';"), 'insert_restart must enforce context-aware label');
assert(prompts.includes("'Close interaction tab' : 'Back Home'"), 'Accessible label should describe Close in tab mode');

// Normal popup behavior remains a clear + reload to Home.
assert(prompts.includes('clear_popup_output();\n    location.reload();'), 'Normal popup terminal behavior must still return Home');

console.log('Interaction-tab CLOSE control regression tests passed.');
