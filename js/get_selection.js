// Get the selected text and page context. selection_capture.js is injected
// immediately before this file and is also available from the persistent
// content-script tracker on normal http(s) pages.
function getSelectionFromPage() {
  let selectedText = '';
  let selectionSource = '';

  if (typeof LitSelectionCapture !== 'undefined') {
    const captured = LitSelectionCapture.captureSelection(document, window, { allowCached: true });
    selectedText = captured.text || '';
    selectionSource = captured.source || '';
  } else {
    try {
      selectedText = window.getSelection().toString();
    } catch (error) {}
  }

  const body_text = document.body ? document.body.innerText : "";
  const body_html = document.body ? document.body.innerHTML : "";
  let run_location = "location unknown";
  try {
    run_location = window.location.toString();
  } catch (error) {
    // Keep the fallback above.
  }

  return [selectedText, body_text, run_location, body_html, {
    selectionSource: selectionSource,
    googleDocs: typeof LitSelectionCapture !== 'undefined' && LitSelectionCapture.isGoogleDocs(window)
  }];
}

var __litActivePageContext = getSelectionFromPage();
if (typeof LitPlatform !== 'undefined') {
  // Keep the historical message path for the top frame only. Popup capture now
  // uses executeScript(allFrames) so iframe selections do not overwrite the
  // top-level page text through competing runtime messages.
  try {
    if (window === window.top) LitPlatform.sendMessage({ selectedText: __litActivePageContext });
  } catch (error) {}
}
__litActivePageContext;
