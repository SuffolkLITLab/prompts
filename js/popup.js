function sameDocumentURL(left, right) {
  try {
    var leftURL = new URL(String(left || ''));
    var rightURL = new URL(String(right || ''));
    return leftURL.origin === rightURL.origin && leftURL.pathname === rightURL.pathname;
  } catch (error) {
    return String(left || '').split(/[?#]/)[0] === String(right || '').split(/[?#]/)[0];
  }
}

function applyActivePageContext(context) {
  if (!Array.isArray(context)) return false;
  selectedText = context[0] || '';
  bodyText = context[1] || '';
  run_location = context[2] || '';
  bodyHTML = context[3] || '';
  return true;
}

function normalizeExtensionPageContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  return {
    highlighted: context.highlighted == null ? '' : String(context.highlighted),
    innerText: context.innerText == null ? '' : String(context.innerText),
    innerHTML: context.innerHTML == null ? '' : String(context.innerHTML)
  };
}

var activePageTab = null;
var activePageSelectionMeta = {};
var popupPermissionState = {
  clipboard: false,
  userScripts: false
};

function isPersistentInteractionTab() {
  return typeof interaction_tab_mode !== 'undefined' && interaction_tab_mode === true;
}

var lastInteractionPageSelection = '';
var interactionContextTabId = null;

function readLiveInteractionPageSelection() {
  var selected = '';
  try {
    selected = window.getSelection ? window.getSelection().toString() : '';
  } catch (error) {}

  if (!selected) {
    var focused = document.activeElement;
    if (focused && /^(textarea|input)$/i.test(focused.tagName || '') &&
        typeof focused.selectionStart === 'number' && typeof focused.selectionEnd === 'number') {
      selected = String(focused.value || '').substring(focused.selectionStart, focused.selectionEnd);
    }
  }
  return selected || '';
}

function rememberInteractionPageSelection() {
  if (!isPersistentInteractionTab()) return;
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
  lastInteractionPageSelection = readLiveInteractionPageSelection();
}

function selectedTextFromInteractionPage() {
  var selected = readLiveInteractionPageSelection();
  if (!selected && typeof document.hasFocus === 'function' && !document.hasFocus()) {
    selected = lastInteractionPageSelection;
  }
  return selected || '';
}

function liveInteractionPageContext() {
  var body = document.body;
  return {
    highlighted: selectedTextFromInteractionPage(),
    innerText: body ? body.innerText : '',
    innerHTML: body ? body.innerHTML : ''
  };
}

function isInteractionTabPageURL(url) {
  try {
    var parsed = new URL(String(url || ''));
    var popupURL = (typeof LitPlatform !== 'undefined' && typeof LitPlatform.getURL === 'function') ? LitPlatform.getURL('popup.html') : '';
    return !!(popupURL && sameDocumentURL(url, popupURL) && parsed.searchParams.get('mode') === 'tab' && parsed.searchParams.get('run'));
  } catch (error) {
    return false;
  }
}

if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
  ['selectionchange', 'select', 'mouseup', 'keyup', 'click', 'input', 'focusin'].forEach(function(eventName) {
    document.addEventListener(eventName, rememberInteractionPageSelection, true);
  });
}

if (typeof LitPlatform !== 'undefined' && typeof LitPlatform.getCurrentTab === 'function') {
  LitPlatform.getCurrentTab().then(function(tab) {
    if (isPersistentInteractionTab() && tab && typeof tab.id !== 'undefined') interactionContextTabId = tab.id;
  }).catch(function() {});
}

function templateRunsInNewTab(choice) {
  if (!choice || !templates || !templates[choice]) return false;
  return templates[choice].run_in_new_tab === true || templates[choice].run_in_new_tab === 1 || templates[choice].run_in_new_tab === '1';
}

function makeInteractionTabScope() {
  return 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

async function launchPromptInNewInteractionTab(choice) {
  if (typeof LitPlatform === 'undefined' || typeof LitPlatform.createTab !== 'function' || typeof LitPlatform.getURL !== 'function') {
    alert('Unable to open a persistent interaction tab in this browser/context.');
    return false;
  }

  var scope = makeInteractionTabScope();
  var launchKey = 'interaction_launch_' + scope;
  var payload = {
    promptName: choice,
    highlighted: selectedText || '',
    innerText: bodyText || '',
    innerHTML: bodyHTML || '',
    location: run_location || '',
    sourceTabId: activePageTab && typeof activePageTab.id !== 'undefined' ? activePageTab.id : null,
    sourceTabUrl: activePageTab && activePageTab.url ? activePageTab.url : (run_location || ''),
    selectionMeta: activePageSelectionMeta || {},
    createdAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(launchKey, JSON.stringify(payload));
  } catch (error) {
    console.error('Unable to prepare the interaction-tab launch payload:', error);
    alert('Unable to open the prompt in a new tab because its page context could not be saved. The active page may be too large for browser storage.');
    return false;
  }

  // Reset the toolbar popup before activating the new tab. Creating an active
  // tab may itself dismiss the browser-action popup before the awaited call
  // returns, so cleanup must happen while this document is definitely alive.
  clear_popup_output();

  try {
    var url = LitPlatform.getURL('popup.html') + '?mode=tab&run=' + encodeURIComponent(scope);
    await LitPlatform.createTab({ url: url, active: true });
  } catch (error) {
    localStorage.removeItem(launchKey);
    // The launch failed and this popup may still be open. Re-enable ordinary
    // persistence for any subsequent in-popup run.
    skip_popup_output_save = false;
    console.error('Unable to open interaction tab:', error);
    alert('Unable to open a new interaction tab: ' + (error && error.message ? error.message : String(error)));
    return false;
  }

  // Focus change usually closes the toolbar popup automatically; this is a
  // harmless explicit close for browsers that leave it alive until script end.
  window.close();
  return true;
}

function isKnownRichSelectionEditor(url) {
  try {
    var parsed = new URL(String(url || ''));
    return parsed.hostname === 'docs.google.com' && /^\/(document|spreadsheets|presentation)\//.test(parsed.pathname || '');
  } catch (error) {
    return false;
  }
}

function applyInjectedPageContexts(injectionResults, fallbackURL) {
  if (!Array.isArray(injectionResults) || !injectionResults.length) return false;
  var usable = injectionResults.filter(function(item) {
    return item && Array.isArray(item.result);
  });
  if (!usable.length) return false;

  var top = usable.find(function(item) { return item.frameId === 0; }) || usable[0];
  applyActivePageContext(top.result);
  run_location = run_location || fallbackURL || '';
  activePageSelectionMeta = (top.result && top.result[4] && typeof top.result[4] === 'object') ? top.result[4] : {};

  // The readable page/HTML comes from the top frame, while highlighted text can
  // come from any frame. This covers editors whose text surface is iframe-backed.
  for (var i = 0; i < usable.length; i += 1) {
    var context = usable[i].result;
    if (context[0]) {
      selectedText = String(context[0]);
      if (context[4] && typeof context[4] === 'object') activePageSelectionMeta = context[4];
      break;
    }
  }
  return true;
}

var popupPermissionStateReady = (async function preloadPopupPermissionState() {
  if (typeof LitPlatform === 'undefined' || !LitPlatform.isExtensionContext()) return;
  try {
    if (typeof LitPlatform.containsPermissions === 'function') {
      popupPermissionState.clipboard = await LitPlatform.containsPermissions(['clipboardRead', 'clipboardWrite']);
    }
    popupPermissionState.userScripts = await LitPlatform.containsPermission('userScripts');
  } catch (error) {
    console.warn('Unable to preload optional permission state:', error);
  }
})();

function cloneClipboardItem(item) {
  return Promise.all((item.types || []).map(async function(type) {
    return [type, await item.getType(type)];
  })).then(function(entries) {
    var values = {};
    entries.forEach(function(entry) { values[entry[0]] = entry[1]; });
    return values;
  });
}

async function snapshotClipboard() {
  if (!navigator.clipboard) throw new Error('Clipboard API is unavailable.');
  var plainText = '';
  try { plainText = await navigator.clipboard.readText(); } catch (error) {}

  if (typeof navigator.clipboard.read === 'function' && typeof ClipboardItem !== 'undefined') {
    try {
      var items = await navigator.clipboard.read();
      var copies = await Promise.all(items.map(cloneClipboardItem));
      return { kind: 'items', items: copies, text: plainText };
    } catch (error) {
      // Fall through to text-only preservation. If the clipboard contains only a
      // non-text item, do not overwrite it because we cannot safely restore it.
      if (!plainText) throw error;
    }
  }
  return { kind: 'text', text: plainText };
}

async function restoreClipboard(snapshot) {
  if (!snapshot || !navigator.clipboard) return false;
  if (snapshot.kind === 'items' && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
    try {
      var items = snapshot.items.map(function(values) { return new ClipboardItem(values); });
      await navigator.clipboard.write(items);
      return true;
    } catch (error) {
      console.warn('Unable to restore rich clipboard data; trying plain text:', error);
    }
  }
  try {
    await navigator.clipboard.writeText(snapshot.text || '');
    return true;
  } catch (error) {
    console.warn('Unable to restore clipboard text:', error);
    return false;
  }
}

async function captureRichEditorSelectionFromClipboard() {
  if (!activePageTab || !activePageTab.id || !popupPermissionState.clipboard || !navigator.clipboard) return '';
  var snapshot = null;
  try {
    snapshot = await snapshotClipboard();
    var copyResults = await LitPlatform.executeScript({
      target: { tabId: activePageTab.id },
      files: ['js/copy_selection.js']
    });
    var copied = Array.isArray(copyResults) && copyResults.some(function(result) {
      return result && result.result && result.result.copied;
    });
    if (!copied) return '';
    await new Promise(function(resolve) { setTimeout(resolve, 40); });
    return String(await navigator.clipboard.readText() || '');
  } catch (error) {
    console.warn('Rich-editor clipboard selection fallback failed:', error);
    return '';
  } finally {
    if (snapshot) {
      var restored = await restoreClipboard(snapshot);
      if (!restored) alert('LIT Prompting captured the selection but could not fully restore your clipboard.');
    }
  }
}

function promptChainNeedsHighlighted(choice) {
  return typeof template_chain_uses_context_variable === 'function' &&
    template_chain_uses_context_variable(choice, ['highlighted', 'nSelectedWords']);
}

function promptOptionalPermissions(choice) {
  var permissions = [];
  var needsJavascript = template_chain_uses_javascript(choice);
  var needsRichSelection = selectedText === '' && promptChainNeedsHighlighted(choice) &&
    activePageTab && isKnownRichSelectionEditor(activePageTab.url);

  if (needsRichSelection && !popupPermissionState.clipboard) {
    permissions.push('clipboardRead', 'clipboardWrite');
  }
  if (needsJavascript && !popupPermissionState.userScripts &&
      typeof LitPlatform !== 'undefined' && LitPlatform.browserFamily() !== 'chromium') {
    permissions.push('userScripts');
  }
  return { permissions: permissions, needsJavascript: needsJavascript, needsRichSelection: needsRichSelection };
}

async function preparePromptRuntime(choice) {
  var needs = promptOptionalPermissions(choice);
  if (needs.permissions.length && typeof LitPlatform.requestPermissions === 'function') {
    // This is deliberately the first awaited privileged action in the click
    // handler. Firefox requires optional permission requests to remain tied to
    // the user gesture.
    var granted = await LitPlatform.requestPermissions(needs.permissions);
    if (granted) {
      if (needs.permissions.indexOf('clipboardRead') >= 0) popupPermissionState.clipboard = true;
      if (needs.permissions.indexOf('userScripts') >= 0) popupPermissionState.userScripts = true;
    } else if (needs.permissions.indexOf('userScripts') >= 0) {
      alert("JavaScript templates need the browser's optional userScripts permission.");
      return false;
    }
  }

  if (needs.needsRichSelection && popupPermissionState.clipboard && selectedText === '') {
    var clipboardSelection = await captureRichEditorSelectionFromClipboard();
    if (clipboardSelection) {
      selectedText = clipboardSelection;
      activePageSelectionMeta = { source: 'native-copy-clipboard-fallback', googleDocs: true };
    }
  }

  if (needs.needsJavascript) {
    // Optional userScripts permission was requested above when needed. This
    // check is non-interactive so it cannot steal the original click gesture.
    var runtime = await javascript_runtime_state(false);
    if (!runtime.ready) {
      alert(runtime.message);
      return false;
    }
  }
  return true;
}

async function requestLiveExtensionPageContext(kind, activeTabId) {
  if (typeof LitPlatform === 'undefined' || typeof LitPlatform.sendMessage !== 'function') return null;
  try {
    const response = await LitPlatform.sendMessage({ litContextRequest: kind, activeTabId: activeTabId });
    return normalizeExtensionPageContext(response);
  } catch (error) {
    console.warn('Unable to request live ' + kind + ' context:', error);
    return null;
  }
}

var activePageContextReady = (async function loadActivePageContext() {
  if (typeof LitPlatform === 'undefined' || !LitPlatform.isExtensionContext()) return;

  // A persistent interaction tab must keep the page context captured before the
  // toolbar popup opened it. Never recapture the now-active interaction tab.
  if (isPersistentInteractionTab() && typeof interaction_launch_payload !== 'undefined' && interaction_launch_payload) {
    selectedText = interaction_launch_payload.highlighted || '';
    bodyText = interaction_launch_payload.innerText || '';
    bodyHTML = interaction_launch_payload.innerHTML || '';
    run_location = interaction_launch_payload.location || interaction_launch_payload.sourceTabUrl || '';
    activePageSelectionMeta = interaction_launch_payload.selectionMeta || {};
    activePageTab = {
      id: interaction_launch_payload.sourceTabId,
      url: interaction_launch_payload.sourceTabUrl || run_location || ''
    };
    return;
  }

  try {
    const currentTab = await LitPlatform.getActiveTab();
    activePageTab = currentTab || null;
    const scratchURL = typeof LitPlatform.getURL === 'function' ? LitPlatform.getURL('scratch.html') : '';
    const optionsURL = typeof LitPlatform.getURL === 'function' ? LitPlatform.getURL('options.html') : '';
    const popupURL = typeof LitPlatform.getURL === 'function' ? LitPlatform.getURL('popup.html') : '';

    if (popupURL && isInteractionTabPageURL(currentTab.url)) {
      // A persistent interaction tab is also an extension-owned page. Ask that
      // active tab for its live selection/text/HTML rather than trying to inject
      // the normal webpage selection scripts into popup.html.
      const liveInteractionContext = await requestLiveExtensionPageContext('interaction', currentTab.id);
      if (liveInteractionContext) {
        selectedText = liveInteractionContext.highlighted || '';
        bodyText = liveInteractionContext.innerText || '';
        bodyHTML = liveInteractionContext.innerHTML || '';
        run_location = currentTab.url || popupURL;
        console.log('Active persistent interaction-tab context: ' + selectedText + '\n\nPage text: ' + bodyText.slice(0, 150));
        return;
      }
    }

    if (scratchURL && sameDocumentURL(currentTab.url, scratchURL)) {
      // Read extension-owned pages directly. A toolbar-popup click can race the
      // page's blur handler, so request the current DOM state first and use the
      // storage snapshot only when no live page responds.
      const liveScratchContext = await requestLiveExtensionPageContext('scratch', currentTab.id);
      selectedText = liveScratchContext ? liveScratchContext.highlighted : getScratchSelectionText();
      bodyText = liveScratchContext ? liveScratchContext.innerText : getScratchText();
      bodyHTML = '';
      run_location = currentTab.url || scratchURL;
      console.log('Highlighted text from active Scratch Pad: ' + selectedText + '\n\nScratch Pad innerText: ' + bodyText.slice(0, 150));
      return;
    }

    if (optionsURL && sameDocumentURL(currentTab.url, optionsURL)) {
      // Templates & Settings also answers a direct live-context request. This
      // avoids depending on blur/pagehide event ordering when the toolbar popup
      // opens immediately after the user selects or edits content.
      const liveOptionsContext = await requestLiveExtensionPageContext('options', currentTab.id);
      const optionsContext = liveOptionsContext || getOptionsPageContext();
      selectedText = optionsContext.highlighted || '';
      bodyText = optionsContext.innerText || '';
      bodyHTML = optionsContext.innerHTML || '';
      run_location = currentTab.url || optionsURL;
      console.log('Active Templates & Settings context: ' + selectedText + '\n\nPage text: ' + bodyText.slice(0, 150));
      return;
    }

    const injectionResults = await LitPlatform.executeScript({
      target: { tabId: currentTab.id, allFrames: true },
      files: ['js/platform.js', 'js/selection_capture.js', 'js/get_selection.js']
    });
    applyInjectedPageContexts(injectionResults, currentTab.url);
  } catch (error) {
    // Some browser-owned/special pages do not allow script injection. The popup
    // can still work with templates that do not depend on page text.
    console.warn('Unable to read the active page:', error);
  }
})();

document.addEventListener('DOMContentLoaded', function() {
  if (typeof LitPlatform !== 'undefined') {
    LitPlatform.sendMessage({ popupOpen: true });
  }
});

if (typeof LitPlatform !== 'undefined') {
  LitPlatform.addMessageListener(function(request, sender, sendResponse) {
    if (request && request.litContextRequest === 'interaction') {
      if (!isPersistentInteractionTab()) return false;
      if (request.activeTabId != null && interactionContextTabId != null && String(request.activeTabId) !== String(interactionContextTabId)) return false;
      if (request.activeTabId != null && interactionContextTabId == null) return false;
      var interactionContext = liveInteractionPageContext();
      if (typeof sendResponse === 'function') sendResponse(interactionContext);
      return false;
    }

    if (request.data) {
      // A persistent interaction tab owns a frozen copy of the source page
      // context captured at launch. Runtime broadcasts are global to extension
      // pages and can arrive late from another popup/page; never let them replace
      // that tab-scoped context.
      if (isPersistentInteractionTab()) return;
      selectedText = request.data[0];
      bodyText = request.data[1];
      run_location = request.data[2] || '';
      bodyHTML = request.data[3] || '';
      console.log('Highlighted text: ' + selectedText + '\n\nBody text: ' + bodyText.slice(0,150) + '\n\nRun location: ' + run_location + '...');
    }
  });
}

document.addEventListener('DOMContentLoaded', function () {
  templates = JSON.parse(localStorage.templates)
  const buttonList = document.getElementById('button_list');

  const pendingInteractionLaunch = isPersistentInteractionTab() &&
    typeof interaction_launch_is_pending !== 'undefined' && interaction_launch_is_pending &&
    interaction_launch_payload && interaction_launch_payload.promptName;

  if (!has_persisted_popup_output() && !pendingInteractionLaunch) {
    // Only show the initial prompt menu for a fresh popup/tab session.
    for (const [key, value] of Object.entries(templates)) {

      if (templates[key]["hide_button"]==false) {
        // Create button element
        const button = document.createElement('button');
        button.textContent = key; // Set button text
        button.id = `template_`+key.replace(/[^a-zA-Z]/g,"_"); // Set button id
        button.dataset.choice = key; // Set data-choice attribute
        button.style.width = '100%'; // Set styles
        button.style.marginBottom = '5px';

        // Do not allow a prompt to run until active-page context and optional
        // permission state have been read. This avoids a selection race without
        // putting a preliminary await in the eventual user-gesture handler.
        button.disabled = true;
        Promise.all([activePageContextReady, popupPermissionStateReady]).finally(function() {
          button.disabled = false;
        });

        // Add event listener to button
        button.addEventListener('click', async function() {
          const choice = this.dataset.choice;
          if (!(await preparePromptRuntime(choice))) return;

          // Run in New Tab is a launch behavior for toolbar-popup Home buttons
          // only. Once already inside a persistent interaction tab, Home buttons
          // reuse that tab instead of opening nested interaction tabs.
          if (templateRunsInNewTab(choice) && !isPersistentInteractionTab()) {
            await launchPromptInNewInteractionTab(choice);
            return;
          }

          start_new_popup_run();
          choose_prompt(choice);
        });

        // Append button to button list in DOM
        buttonList.appendChild(button);
      }

    };
  } else {
    buttonList.style.display = 'none';
  }

  start_spinner('thinking');

  if (pendingInteractionLaunch) {
    Promise.all([activePageContextReady, popupPermissionStateReady]).then(function() {
      var choice = String(interaction_launch_payload.promptName || '');
      // A successful handoff is one-time. Context remains in this tab's
      // sessionStorage for reloads, while this launch marker is consumed.
      try { localStorage.removeItem(interaction_launch_storage_key); } catch (error) {}
      interaction_launch_is_pending = false;
      start_new_popup_run();
      choose_prompt(choice);
    }).catch(function(error) {
      console.error('Unable to start the persistent interaction tab:', error);
      alert('Unable to start the interaction tab: ' + (error && error.message ? error.message : String(error)));
      buttonList.style.display = '';
    });
  }

});

window.onbeforeunload = function () {
  window.scrollTo(0, 0);
}
