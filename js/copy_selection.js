// Rich-editor fallback: ask the active document to perform its native Copy
// command. popup.js snapshots and restores the system clipboard around this
// operation and only invokes it after optional clipboard permissions are granted.
(function () {
  function tryCopy(doc) {
    if (!doc || typeof doc.execCommand !== 'function') return false;
    try {
      return !!doc.execCommand('copy');
    } catch (error) {
      return false;
    }
  }

  // Rich editors commonly keep keyboard input in an iframe even when visible
  // text is canvas-backed. Try the currently active iframe and Google Docs'
  // known text-event iframe before falling back to the top-level document.
  try {
    var active = document.activeElement;
    if (active && String(active.tagName || '').toLowerCase() === 'iframe') {
      if (tryCopy(active.contentDocument)) return { copied: true, source: 'active-frame' };
    }
  } catch (error) {}

  try {
    var docsFrame = document.querySelector('iframe.docs-texteventtarget-iframe');
    if (docsFrame && tryCopy(docsFrame.contentDocument)) return { copied: true, source: 'google-docs-frame' };
  } catch (error) {}

  return { copied: tryCopy(document), source: 'document' };
})();
