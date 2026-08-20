#!/usr/bin/env node
/* Regression checks for split-pane resize isolation. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const prompts = read('js/prompts.js');
const options = read('js/options.js');
const popup = read('popup.html');
const popupCss = read('css/popup.css');
const exportedCss = read('css/popup_exported.css');
const scratchCss = read('css/popup_scratch.css');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(popup.includes('id="panel_resize_handle"') && popup.includes('role="separator"'), 'Dedicated separator handle missing.');
assert(/#panel_resize_handle\s*\{[\s\S]*?display\s*:\s*none/.test(popupCss), 'Extension popup must hide resize handle.');
assert(/#panel_resize_handle\s*\{[\s\S]*?display\s*:\s*none/.test(exportedCss), 'Interactions-only export must hide resize handle.');
assert(/#panel_resize_handle\s*\{[\s\S]*?display\s*:\s*block/.test(scratchCss), 'Scratch+Interactions export must show resize handle.');
assert(prompts.includes('isExtension || !scratchVisible'), 'Resize initialization must be gated away from extension/hidden scratch contexts.');
assert(prompts.includes('handle.addEventListener("pointerdown"'), 'Resize must start from the dedicated handle.');
assert(prompts.includes('handle.setPointerCapture(pointerId)'), 'Resize must use pointer capture.');
assert(prompts.includes('handle.addEventListener("keydown"'), 'Separator must support keyboard resizing.');
assert(!prompts.includes('e.offsetX < BORDER_SIZE'), 'Legacy child-offset edge detection is still present.');
assert(!prompts.includes('document.addEventListener("mousemove", resize'), 'Legacy document mousemove resize listener is still present.');
assert(!options.includes('function resize(e,disable=0)'), 'Exporter should no longer rewrite resize source code.');

console.log('Split-pane resize regression tests passed.');
