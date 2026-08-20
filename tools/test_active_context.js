#!/usr/bin/env node
/* Regression tests for active-tab prompt context, including Scratch Pad and Templates & Settings. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const popupSource = fs.readFileSync(path.join(ROOT, 'js/popup.js'), 'utf8');
const cutoff = popupSource.indexOf("document.addEventListener('DOMContentLoaded'");
if (cutoff < 0) throw new Error('Unable to isolate popup active-context bootstrap.');
const bootstrap = popupSource.slice(0, cutoff);

async function runPopupCase({ activeUrl, scratchUrl, optionsUrl, popupUrl = 'moz-extension://example/popup.html', scratchSelection, scratchText = '', optionsContext = null, liveScratchContext = null, liveOptionsContext = null, liveInteractionContext = null, injectionResult, injectionResults = null }) {
  let executeCalls = 0;
  const executeArgs = [];
  const sentMessages = [];
  const context = {
    console: { log() {}, warn() {}, error() {} },
    URL,
    selectedText: '',
    bodyText: '',
    run_location: '',
    bodyHTML: '',
    getScratchSelectionText: () => scratchSelection,
    getScratchText: () => scratchText,
    getOptionsPageContext: () => optionsContext || { highlighted: '', innerText: '', innerHTML: '' },
    LitPlatform: {
      isExtensionContext: () => true,
      getURL: (target) => {
        if (target === 'options.html') return optionsUrl;
        if (target === 'popup.html') return popupUrl;
        return scratchUrl;
      },
      getActiveTab: async () => ({ id: 42, url: activeUrl }),
      sendMessage: async (message) => {
        sentMessages.push(message);
        if (message && message.litContextRequest === 'scratch') return liveScratchContext;
        if (message && message.litContextRequest === 'options') return liveOptionsContext;
        if (message && message.litContextRequest === 'interaction') return liveInteractionContext;
        return null;
      },
      containsPermissions: async () => false,
      containsPermission: async () => false,
      browserFamily: () => 'firefox',
      executeScript: async (args) => {
        executeCalls += 1;
        executeArgs.push(args);
        return injectionResults || [{ frameId: 0, result: injectionResult }];
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(bootstrap, context);
  await context.activePageContextReady;
  await context.popupPermissionStateReady;
  return { context, executeCalls, executeArgs, sentMessages };
}

(async function main() {
  const scratch = await runPopupCase({
    activeUrl: 'moz-extension://example/scratch.html#still-scratch',
    scratchUrl: 'moz-extension://example/scratch.html',
    optionsUrl: 'moz-extension://example/options.html',
    scratchSelection: 'STALE scratch selection',
    scratchText: 'STALE scratch text',
    liveScratchContext: {
      highlighted: 'selected in scratch',
      innerText: 'the entire scratch pad',
      innerHTML: ''
    },
    injectionResult: ['WRONG', 'WRONG', 'WRONG', 'WRONG']
  });
  if (scratch.context.selectedText !== 'selected in scratch') {
    throw new Error('Active Scratch Pad selection was not used for {{highlighted}}.');
  }
  if (scratch.context.bodyText !== 'the entire scratch pad') {
    throw new Error('Active Scratch Pad contents were not used for {{innerText}}.');
  }
  if (scratch.executeCalls !== 0) {
    throw new Error('Scratch Pad should not use normal page script injection.');
  }

  if (!scratch.sentMessages.some((message) => message && message.litContextRequest === 'scratch' && message.activeTabId === 42)) {
    throw new Error('Scratch Pad live-context request is not targeted to the active tab id.');
  }

  const settings = await runPopupCase({
    activeUrl: 'moz-extension://example/options.html#prompt-list',
    scratchUrl: 'moz-extension://example/scratch.html',
    optionsUrl: 'moz-extension://example/options.html',
    scratchSelection: 'stale scratch selection',
    optionsContext: {
      highlighted: 'STALE settings selection',
      innerText: '',
      innerHTML: ''
    },
    liveOptionsContext: {
      highlighted: 'selected in settings',
      innerText: 'Templates and Settings visible text',
      innerHTML: '<main><textarea>settings</textarea></main>'
    },
    injectionResult: ['WRONG', 'WRONG', 'WRONG', 'WRONG']
  });
  if (settings.context.selectedText !== 'selected in settings') {
    throw new Error('Active Templates & Settings selection was not used for {{highlighted}}.');
  }
  if (settings.context.bodyText !== 'Templates and Settings visible text') {
    throw new Error('Active Templates & Settings text was not used for {{innerText}}.');
  }
  if (settings.context.bodyHTML !== '<main><textarea>settings</textarea></main>') {
    throw new Error('Active Templates & Settings HTML was not used for {{innerHTML}}.');
  }
  if (settings.executeCalls !== 0) {
    throw new Error('Templates & Settings should not use normal page script injection.');
  }

  if (!settings.sentMessages.some((message) => message && message.litContextRequest === 'options' && message.activeTabId === 42)) {
    throw new Error('Templates & Settings live-context request is not targeted to the active tab id.');
  }

  const interaction = await runPopupCase({
    activeUrl: 'moz-extension://example/popup.html?mode=tab&run=tab_123',
    popupUrl: 'moz-extension://example/popup.html',
    scratchUrl: 'moz-extension://example/scratch.html',
    optionsUrl: 'moz-extension://example/options.html',
    scratchSelection: '',
    liveInteractionContext: {
      highlighted: 'selected interaction output',
      innerText: 'persistent interaction visible text',
      innerHTML: '<main><div class="output_text">persistent interaction</div></main>'
    },
    injectionResult: ['WRONG', 'WRONG', 'WRONG', 'WRONG']
  });
  if (interaction.context.selectedText !== 'selected interaction output') {
    throw new Error('Active persistent interaction-tab selection was not used for {{highlighted}}.');
  }
  if (interaction.context.bodyText !== 'persistent interaction visible text' ||
      interaction.context.bodyHTML !== '<main><div class="output_text">persistent interaction</div></main>') {
    throw new Error('Active persistent interaction-tab text/HTML was not used for {{innerText}}/{{innerHTML}}.');
  }
  if (interaction.executeCalls !== 0) {
    throw new Error('Persistent interaction tabs should not use normal page script injection.');
  }
  if (!interaction.sentMessages.some((message) => message && message.litContextRequest === 'interaction' && message.activeTabId === 42)) {
    throw new Error('Persistent interaction live-context request is not targeted to the active tab id.');
  }

  const settingsFallback = await runPopupCase({
    activeUrl: 'moz-extension://example/options.html',
    scratchUrl: 'moz-extension://example/scratch.html',
    optionsUrl: 'moz-extension://example/options.html',
    scratchSelection: '',
    optionsContext: {
      highlighted: 'stored selection',
      innerText: 'stored settings text',
      innerHTML: '<main>stored</main>'
    },
    liveOptionsContext: null,
    injectionResult: ['WRONG', 'WRONG', 'WRONG', 'WRONG']
  });
  if (settingsFallback.context.selectedText !== 'stored selection' || settingsFallback.context.bodyText !== 'stored settings text') {
    throw new Error('Templates & Settings storage fallback no longer works when no live page responds.');
  }

  const web = await runPopupCase({
    activeUrl: 'https://example.com/article',
    scratchUrl: 'moz-extension://example/scratch.html',
    optionsUrl: 'moz-extension://example/options.html',
    scratchSelection: 'stale scratch selection',
    injectionResult: ['selected on web page', 'page text', 'https://example.com/article', '<p>page</p>']
  });
  if (web.context.selectedText !== 'selected on web page') {
    throw new Error('Normal page selection was incorrectly replaced by Scratch Pad state.');
  }
  if (web.context.bodyText !== 'page text' || web.executeCalls !== 1) {
    throw new Error('Normal active-page context capture regressed.');
  }
  if (!web.executeArgs[0] || !web.executeArgs[0].target || web.executeArgs[0].target.allFrames !== true) {
    throw new Error('Normal active-page capture must inspect all frames for rich/iframe editors.');
  }
  if (!web.executeArgs[0].files.includes('js/selection_capture.js')) {
    throw new Error('On-demand active-page capture must load the shared selection helper.');
  }

  const framed = await runPopupCase({
    activeUrl: 'https://editor.example.test/document',
    scratchUrl: 'moz-extension://example/scratch.html',
    optionsUrl: 'moz-extension://example/options.html',
    scratchSelection: '',
    injectionResults: [
      { frameId: 0, result: ['', 'top page text', 'https://editor.example.test/document', '<main>top</main>', { selectionSource: '' }] },
      { frameId: 7, result: ['selection in editor iframe', 'frame text', 'https://editor.example.test/frame', '<p>frame</p>', { selectionSource: 'pre-focus-cache' }] }
    ]
  });
  if (framed.context.selectedText !== 'selection in editor iframe') {
    throw new Error('Iframe selection was not promoted to {{highlighted}}.');
  }
  if (framed.context.bodyText !== 'top page text' || framed.context.bodyHTML !== '<main>top</main>') {
    throw new Error('Iframe selection should not replace top-frame innerText/innerHTML.');
  }

  if (!popupSource.includes("request.litContextRequest === 'interaction'") ||
      !popupSource.includes('liveInteractionPageContext()') ||
      !popupSource.includes('lastInteractionPageSelection') ||
      !popupSource.includes("requestLiveExtensionPageContext('interaction', currentTab.id)")) {
    throw new Error('Persistent interaction tab no longer exposes/consumes live selection/text/HTML context.');
  }

  const scratchSource = fs.readFileSync(path.join(ROOT, 'js/scratch.js'), 'utf8');
  if (!scratchSource.includes('liveScratchPageContext()') || !scratchSource.includes("request.litContextRequest !== 'scratch'") || !scratchSource.includes('litContextTabId') || !scratchSource.includes("window.addEventListener('blur', pause)")) {
    throw new Error('Scratch Pad no longer exposes live context with storage fallback.');
  }
  const optionsSource = fs.readFileSync(path.join(ROOT, 'js/options.js'), 'utf8');
  if (!optionsSource.includes("request.litContextRequest !== 'options'") ||
      !optionsSource.includes('litContextTabId') ||
      !optionsSource.includes('lastSettingsSelection') ||
      !optionsSource.includes("window.addEventListener('blur', syncSettingsPageContext)") ||
      !optionsSource.includes('innerHTML: body ? body.innerHTML')) {
    throw new Error('Templates & Settings no longer exposes live selection/text/HTML with focus-safe selection caching.');
  }
  const scratchHtml = fs.readFileSync(path.join(ROOT, 'scratch.html'), 'utf8');
  if (!scratchHtml.includes('js/platform.js')) {
    throw new Error('Scratch Pad must load platform.js to answer live context requests.');
  }
  const platformSource = fs.readFileSync(path.join(ROOT, 'js/platform.js'), 'utf8');
  if (!platformSource.includes('async function getCurrentTab()') || !platformSource.includes('getCurrentTab: getCurrentTab')) {
    throw new Error('Platform layer no longer exposes current extension-page tab identity.');
  }
  const getSelectionSource = fs.readFileSync(path.join(ROOT, 'js/get_selection.js'), 'utf8');
  if (!getSelectionSource.trim().endsWith('__litActivePageContext;') || !getSelectionSource.includes('LitSelectionCapture.captureSelection')) {
    throw new Error('Injected page context is no longer returned through the shared selection capture helper.');
  }

  for (const manifestName of ['manifest.firefox.json', 'manifest.chrome.json']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifests', manifestName), 'utf8'));
    const scripts = manifest.content_scripts || [];
    const tracker = scripts.find((item) => Array.isArray(item.js) && item.js.includes('js/selection_tracker.js'));
    if (!tracker || tracker.all_frames !== true || !tracker.js.includes('js/selection_capture.js')) {
      throw new Error(manifestName + ' must install the pre-focus selection tracker in all frames.');
    }
    const optional = manifest.optional_permissions || [];
    if (!optional.includes('clipboardRead') || !optional.includes('clipboardWrite')) {
      throw new Error(manifestName + ' must expose rich-editor clipboard access as optional permissions.');
    }
  }

  console.log('Active-tab context regression tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
