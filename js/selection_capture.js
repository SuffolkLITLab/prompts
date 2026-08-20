/*
 * Selection capture helpers shared by the always-on selection tracker and the
 * on-demand popup capture. Keep this file dependency-free: it runs inside
 * ordinary web pages, including rich/canvas editors such as Google Docs.
 */
(function (global) {
  'use strict';

  if (global.LitSelectionCapture) return;

  function cleanText(value) {
    return value == null ? '' : String(value).replace(/\u00a0/g, ' ');
  }

  function windowSelection(win) {
    try {
      var selection = win && typeof win.getSelection === 'function' ? win.getSelection() : null;
      return selection ? cleanText(selection.toString()) : '';
    } catch (error) {
      return '';
    }
  }

  function controlSelection(doc) {
    try {
      var focused = doc && doc.activeElement;
      if (!focused) return '';
      var tag = String(focused.tagName || '').toLowerCase();
      if (tag !== 'textarea' && tag !== 'input') return '';
      if (typeof focused.selectionStart !== 'number' || typeof focused.selectionEnd !== 'number') return '';
      if (focused.selectionEnd <= focused.selectionStart) return '';
      return cleanText(String(focused.value || '').substring(focused.selectionStart, focused.selectionEnd));
    } catch (error) {
      return '';
    }
  }

  function focusedFrameSelection(doc) {
    try {
      var focused = doc && doc.activeElement;
      if (!focused || String(focused.tagName || '').toLowerCase() !== 'iframe') return '';
      var frameWindow = focused.contentWindow;
      var selected = windowSelection(frameWindow);
      if (selected) return selected;
      return controlSelection(focused.contentDocument);
    } catch (error) {
      // Cross-origin frames are handled by allFrames injection instead.
      return '';
    }
  }

  function isGoogleDocs(win) {
    try {
      return win.location.hostname === 'docs.google.com' && /^\/document\//.test(win.location.pathname || '');
    } catch (error) {
      return false;
    }
  }

  function usableRect(element) {
    try {
      var rect = element.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    } catch (error) {
      return null;
    }
  }

  function intersection(a, b) {
    var left = Math.max(a.left, b.left);
    var right = Math.min(a.right, b.right);
    var top = Math.max(a.top, b.top);
    var bottom = Math.min(a.bottom, b.bottom);
    if (right <= left || bottom <= top) return null;
    return {
      left: left,
      right: right,
      top: top,
      bottom: bottom,
      width: right - left,
      height: bottom - top
    };
  }

  function directAccessibleSelection(doc) {
    var selectors = [
      '.kix-canvas-tile-selection [aria-label]',
      '.kix-selection-overlay [aria-label]',
      '.kix-canvas-tile-selection [data-text]'
    ];
    var values = [];
    selectors.forEach(function (selector) {
      try {
        Array.prototype.forEach.call(doc.querySelectorAll(selector), function (element) {
          var value = element.getAttribute('aria-label') || element.getAttribute('data-text') || '';
          value = cleanText(value).trim();
          if (value && values.indexOf(value) < 0) values.push(value);
        });
      } catch (error) {
        // Google Docs' private DOM changes frequently; every heuristic is optional.
      }
    });
    return values.join('\n');
  }

  function googleDocsSelectionRects(doc) {
    var selectors = [
      '.kix-selection-overlay',
      '.kix-canvas-tile-selection > svg > rect',
      '.kix-canvas-tile-selection svg rect'
    ];
    var rects = [];
    selectors.forEach(function (selector) {
      try {
        Array.prototype.forEach.call(doc.querySelectorAll(selector), function (element) {
          var rect = usableRect(element);
          if (!rect) return;
          // Avoid duplicates from nested selection elements with identical geometry.
          var duplicate = rects.some(function (existing) {
            return Math.abs(existing.left - rect.left) < 0.5 &&
              Math.abs(existing.top - rect.top) < 0.5 &&
              Math.abs(existing.width - rect.width) < 0.5 &&
              Math.abs(existing.height - rect.height) < 0.5;
          });
          if (!duplicate) rects.push(rect);
        });
      } catch (error) {}
    });
    return rects;
  }

  function annotatedCanvasCandidates(doc) {
    var root = null;
    try {
      root = doc.querySelector('.kix-appview-editor') || doc.querySelector('.kix-zoomdocumentplugin-outer') || doc;
    } catch (error) {
      root = doc;
    }

    var selectors = [
      'svg[aria-label]',
      'g[role="paragraph"][aria-label]',
      '[role="paragraph"] [aria-label]',
      '.kix-canvas-tile-content [aria-label]'
    ];
    var seen = [];
    var candidates = [];
    selectors.forEach(function (selector) {
      try {
        Array.prototype.forEach.call(root.querySelectorAll(selector), function (element) {
          if (seen.indexOf(element) >= 0) return;
          seen.push(element);
          var label = cleanText(element.getAttribute('aria-label') || '').trim();
          var rect = usableRect(element);
          if (!label || !rect) return;
          candidates.push({ element: element, label: label, rect: rect });
        });
      } catch (error) {}
    });
    return candidates;
  }

  function clipAccessibleLabel(candidate, selectionRects) {
    var intersections = [];
    selectionRects.forEach(function (selectionRect) {
      var overlap = intersection(candidate.rect, selectionRect);
      if (!overlap) return;
      // Selection rectangles and annotated text can differ slightly vertically.
      var verticalShare = overlap.height / Math.min(candidate.rect.height, selectionRect.height);
      if (verticalShare >= 0.25) intersections.push(overlap);
    });
    if (!intersections.length) return '';

    var left = Math.min.apply(null, intersections.map(function (rect) { return rect.left; }));
    var right = Math.max.apply(null, intersections.map(function (rect) { return rect.right; }));
    var coverage = Math.max(0, Math.min(1, (right - left) / candidate.rect.width));
    var label = candidate.label;

    // Annotated Canvas commonly exposes a line/chunk as one aria-label. If the
    // selection covers only part of that chunk, use its selection rectangle to
    // estimate the character slice. This is intentionally a fallback: exact DOM
    // selections and clipboard capture take priority whenever available.
    if (coverage < 0.96 && label.length > 1) {
      var startRatio = Math.max(0, Math.min(1, (left - candidate.rect.left) / candidate.rect.width));
      var endRatio = Math.max(0, Math.min(1, (right - candidate.rect.left) / candidate.rect.width));
      var direction = '';
      try { direction = (candidate.element.getAttribute('direction') || candidate.element.getAttribute('dir') || '').toLowerCase(); } catch (error) {}
      if (direction === 'rtl') {
        var oldStart = startRatio;
        startRatio = 1 - endRatio;
        endRatio = 1 - oldStart;
      }
      var start = Math.max(0, Math.floor(startRatio * label.length));
      var end = Math.min(label.length, Math.ceil(endRatio * label.length));
      label = label.slice(start, Math.max(start + 1, end));
    }

    return cleanText(label).trim();
  }

  function annotatedGoogleDocsSelection(doc, win) {
    if (!isGoogleDocs(win)) return '';

    // Some accessibility modes expose selected text directly on the selection
    // layer. Prefer that before doing any geometry-based approximation.
    var direct = directAccessibleSelection(doc);
    if (direct) return direct;

    var selectionRects = googleDocsSelectionRects(doc);
    if (!selectionRects.length) return '';
    var candidates = annotatedCanvasCandidates(doc);
    if (!candidates.length) return '';

    var matched = [];
    candidates.forEach(function (candidate) {
      var text = clipAccessibleLabel(candidate, selectionRects);
      if (!text) return;
      matched.push({ text: text, rect: candidate.rect });
    });
    if (!matched.length) return '';

    matched.sort(function (a, b) {
      if (Math.abs(a.rect.top - b.rect.top) > Math.min(a.rect.height, b.rect.height) * 0.45) {
        return a.rect.top - b.rect.top;
      }
      return a.rect.left - b.rect.left;
    });

    var lines = [];
    matched.forEach(function (item) {
      var previous = lines.length ? lines[lines.length - 1] : null;
      if (!previous || Math.abs(previous.top - item.rect.top) > Math.min(previous.height, item.rect.height) * 0.55) {
        lines.push({ top: item.rect.top, height: item.rect.height, parts: [item.text] });
      } else if (previous.parts.indexOf(item.text) < 0) {
        previous.parts.push(item.text);
      }
    });

    return lines.map(function (line) { return line.parts.join(' '); }).join('\n').trim();
  }

  function ariaSelectedText(doc) {
    // A conservative generic fallback for rich editors that mirror selection in
    // ARIA. Restrict this to editable/textbox ancestors so selected menu/list
    // options are not mistaken for highlighted document text.
    var values = [];
    try {
      Array.prototype.forEach.call(doc.querySelectorAll('[aria-selected="true"]'), function (element) {
        var editor = element.closest('[contenteditable="true"], [role="textbox"]');
        if (!editor) return;
        var text = cleanText(element.getAttribute('aria-label') || element.textContent || '').trim();
        if (text && values.indexOf(text) < 0) values.push(text);
      });
    } catch (error) {}
    return values.join('\n');
  }

  function cachedSelection(win) {
    try {
      var state = win && win.__litSelectionTrackerState;
      return state && state.text ? cleanText(state.text) : '';
    } catch (error) {
      return '';
    }
  }

  function captureSelection(doc, win, options) {
    options = options || {};
    var text = windowSelection(win);
    if (text) return { text: text, source: 'window-selection' };

    text = controlSelection(doc);
    if (text) return { text: text, source: 'form-control' };

    text = focusedFrameSelection(doc);
    if (text) return { text: text, source: 'focused-frame' };

    text = annotatedGoogleDocsSelection(doc, win);
    if (text) return { text: text, source: 'google-docs-annotated-canvas' };

    text = ariaSelectedText(doc);
    if (text) return { text: text, source: 'aria-selection' };

    if (options.allowCached !== false) {
      text = cachedSelection(win);
      if (text) return { text: text, source: 'pre-focus-cache' };
    }

    return { text: '', source: '' };
  }

  global.LitSelectionCapture = {
    captureSelection: captureSelection,
    isGoogleDocs: isGoogleDocs,
    annotatedGoogleDocsSelection: annotatedGoogleDocsSelection
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
