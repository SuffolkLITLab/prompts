#!/usr/bin/env node
/* Regression tests for Google Docs/rich-editor highlighted-text fallbacks. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const captureSource = fs.readFileSync(path.join(ROOT, 'js/selection_capture.js'), 'utf8');

function elementWithLabel(label) {
  return {
    getAttribute(name) { return name === 'aria-label' ? label : ''; },
    getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20 }; },
    closest() { return null; }
  };
}

(function testGoogleDocsAccessibleSelection() {
  const selectedElement = elementWithLabel('Selected Google Docs text');
  const document = {
    activeElement: null,
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === '.kix-canvas-tile-selection [aria-label]') return [selectedElement];
      return [];
    }
  };
  const context = {
    document,
    location: { hostname: 'docs.google.com', pathname: '/document/d/example/edit' },
    getSelection: () => ({ toString: () => '' }),
    globalThis: null
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(captureSource, context);
  const result = context.LitSelectionCapture.captureSelection(document, context, { allowCached: true });
  if (result.text !== 'Selected Google Docs text' || result.source !== 'google-docs-annotated-canvas') {
    throw new Error('Google Docs accessible/canvas selection fallback failed.');
  }
})();

(function testPreFocusCache() {
  const document = {
    activeElement: null,
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const context = {
    document,
    location: { hostname: 'editor.example', pathname: '/doc' },
    getSelection: () => ({ toString: () => '' }),
    __litSelectionTrackerState: { text: 'selection cached before popup focus', source: 'window-selection', updatedAt: Date.now() },
    globalThis: null
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(captureSource, context);
  const result = context.LitSelectionCapture.captureSelection(document, context, { allowCached: true });
  if (result.text !== 'selection cached before popup focus' || result.source !== 'pre-focus-cache') {
    throw new Error('Pre-focus rich-editor selection cache failed.');
  }
})();

(function testCopyFallbackScript() {
  const copySource = fs.readFileSync(path.join(ROOT, 'js/copy_selection.js'), 'utf8');
  let copyCalls = 0;
  const document = {
    activeElement: null,
    querySelector() { return null; },
    execCommand(command) { if (command === 'copy') copyCalls += 1; return command === 'copy'; }
  };
  const context = { document };
  vm.createContext(context);
  const result = vm.runInContext(copySource, context);
  if (!result || !result.copied || copyCalls !== 1) {
    throw new Error('Native Copy selection fallback script failed.');
  }
})();

const popupSource = fs.readFileSync(path.join(ROOT, 'js/popup.js'), 'utf8');
for (const required of [
  'isKnownRichSelectionEditor',
  'snapshotClipboard',
  'restoreClipboard',
  'captureRichEditorSelectionFromClipboard',
  "['highlighted', 'nSelectedWords']",
  "files: ['js/copy_selection.js']"
]) {
  if (!popupSource.includes(required)) throw new Error('popup.js is missing rich-editor fallback: ' + required);
}

console.log('Rich-editor selection regression tests passed.');
