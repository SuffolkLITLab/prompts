#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'js', 'prompts.js'), 'utf8');

assert(source.includes('function scroll_restored_popup_to_bottom()'), 'Restored-popup bottom scroll helper missing');
assert(source.includes('scroll_restored_popup_to_bottom();'), 'Restored popup does not invoke bottom scroll helper');
assert(source.includes("LitPlatform.isExtensionContext && LitPlatform.isExtensionContext()"), 'Bottom scroll should be extension-context-only');
assert(source.includes('requestAnimationFrame(function()'), 'Bottom scroll should wait for restored layout to settle');
assert(source.includes('scrollingElement.scrollTop = scrollingElement.scrollHeight;'), 'Bottom scroll should target newest content');

assert(source.includes('function lockViewportForExpandedCode()'), 'Expanded-code viewport lock missing');
assert(source.includes('function unlockViewportAfterExpandedCode()'), 'Expanded-code viewport unlock missing');
assert(source.includes("root.style.height = height + 'px';"), 'Expanded code should pin current root height');
assert(source.includes("body.style.height = height + 'px';"), 'Expanded code should pin current body height');
assert(source.includes('lockViewportForExpandedCode();\n        card.classList.add("is-expanded")'), 'Viewport must lock before code card leaves document flow');
assert(source.includes('unlockViewportAfterExpandedCode();'), 'Viewport should unlock after expanded card collapses');

console.log('Popup restore/code-expand regression tests passed.');
