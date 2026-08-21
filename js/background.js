// Chrome MV3 runs this file as a service worker, while Firefox currently loads it
// as a background script. Import the shared compatibility layer when needed.
if (typeof LitPlatform === 'undefined' && typeof importScripts === 'function') {
  importScripts('platform.js');
}

function sendInfoToPopup(info) {
  if (typeof LitPlatform !== 'undefined') {
    LitPlatform.sendMessage({ data: info });
  }
}

if (typeof LitPlatform !== 'undefined') {
  LitPlatform.addMessageListener(function(request, sender, sendResponse) {
    if (request.selectedText) {
      sendInfoToPopup(request.selectedText);
    }
    if (request.bodyText) {
      sendInfoToPopup(request.bodyText);
    }
  });
}
