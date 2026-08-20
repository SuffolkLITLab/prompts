/*
 * Keep the most recent user selection in this frame while the page still owns
 * focus. Toolbar popups can then read the cached value after focus has moved out
 * of editors that collapse/virtualize their selection on blur.
 */
(function (global) {
  'use strict';

  if (global.__litSelectionTrackerInstalled || typeof global.LitSelectionCapture === 'undefined') return;
  global.__litSelectionTrackerInstalled = true;

  var state = global.__litSelectionTrackerState = global.__litSelectionTrackerState || {
    text: '',
    source: '',
    updatedAt: 0
  };

  var scheduled = null;

  function update(allowClear) {
    var result = global.LitSelectionCapture.captureSelection(document, global, { allowCached: false });
    if (result.text) {
      state.text = result.text;
      state.source = result.source || '';
      state.updatedAt = Date.now();
      return;
    }

    // When focus has already moved to the browser toolbar/popup, keep the last
    // known selection. Clear only while this frame still owns focus, which means
    // the user actually collapsed/replaced the selection in the page.
    var hasFocus = false;
    try { hasFocus = document.hasFocus(); } catch (error) {}
    if (allowClear && hasFocus) {
      state.text = '';
      state.source = '';
      state.updatedAt = Date.now();
    }
  }

  function schedule(allowClear) {
    if (scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(function () {
      scheduled = null;
      update(allowClear);
    }, 0);
  }

  document.addEventListener('selectionchange', function () { schedule(true); }, true);
  document.addEventListener('mouseup', function () { schedule(true); }, true);
  document.addEventListener('keyup', function () { schedule(true); }, true);
  document.addEventListener('input', function () { schedule(true); }, true);
  document.addEventListener('focusin', function () { schedule(false); }, true);
  document.addEventListener('copy', function () { update(false); }, true);
  global.addEventListener('blur', function () { update(false); }, true);

  global.__litSelectionTracker = {
    get: function () {
      return { text: state.text || '', source: state.source || '', updatedAt: state.updatedAt || 0 };
    },
    refresh: function () {
      update(false);
      return this.get();
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
