//
// Load defaults
//

// Migrate the pre-0.2.4 single API key into the endpoint-key registry.
migrate_legacy_api_key_to_registry();
var api_keys = get_api_key_registry();

// Standalone exports can replace this marker with a password-protected API-key bootstrap.
var api_key_ready = Promise.resolve(true);
//FOR EXPORT ENCRYPTED KEY: api_key_ready = Promise.resolve(true);

var api_base = get_default_api_endpoint();

var bodyText = "";
var bodyHTML = "";
var selectedText = "";
var run_location = "";
var question_arry = {};
var last_question = "";
var output_type = "";
var llm_prompt = "";
var llm_messages = [];
var chat_anchor_prompt = "";
var LLM_text_collection = "";
var model = "";
var template = "";
var temperature = 0;
var max_tokens = 0;
var reasoning_effort = "";
var verbosity = "";
var json_mode = 0;
var json_schema = "";
var json_schema_name = "structured_response";
var output_to = 0;
var behavior = "";
var passThrough = "";
var bubble = 0;
var calls = 0;
var run_has_committed_step = false;

// A persistent interaction tab reuses popup.html but gets its own storage scope.
// This keeps reload/restore state isolated from the toolbar popup and from other
// concurrently open interaction tabs. Standalone exports never set mode=tab.
function interactionTabQueryState() {
  try {
    var params = new URLSearchParams(window.location.search || '');
    var mode = params.get('mode') || '';
    var scope = params.get('run') || '';
    return { mode: mode === 'tab', scope: scope.replace(/[^a-zA-Z0-9_-]/g, '') };
  } catch (error) {
    return { mode: false, scope: '' };
  }
}

var interaction_tab_query = interactionTabQueryState();
var interaction_tab_mode = interaction_tab_query.mode && !!interaction_tab_query.scope;
var interaction_tab_scope = interaction_tab_mode ? interaction_tab_query.scope : '';
var interaction_launch_storage_key = interaction_tab_mode ? 'interaction_launch_' + interaction_tab_scope : '';
var interaction_context_session_key = 'lit_interaction_context';
var interaction_launch_payload = null;
var interaction_launch_is_pending = false;
var prompt_context_tab_id = null;

if (interaction_launch_storage_key) {
  try {
    // The one-time launch payload crosses from the toolbar popup to the new tab
    // through a unique localStorage key. Once the tab receives it, also copy it
    // into this tab's sessionStorage so reloads keep the original page context
    // without sharing that context with any other interaction tab.
    var launchRaw = localStorage.getItem(interaction_launch_storage_key);
    var sessionRaw = null;
    try { sessionRaw = sessionStorage.getItem(interaction_context_session_key); } catch (sessionError) {}
    interaction_launch_is_pending = !!launchRaw;
    var contextRaw = launchRaw || sessionRaw;
    if (contextRaw) interaction_launch_payload = JSON.parse(contextRaw);
    if (launchRaw) {
      try { sessionStorage.setItem(interaction_context_session_key, launchRaw); } catch (sessionError) {
        console.warn('Unable to preserve interaction-tab context across reloads:', sessionError);
      }
    }
    if (interaction_launch_payload && Number.isInteger(Number(interaction_launch_payload.sourceTabId))) {
      prompt_context_tab_id = Number(interaction_launch_payload.sourceTabId);
    }
  } catch (error) {
    console.warn('Unable to read the interaction-tab launch payload:', error);
    interaction_launch_payload = null;
  }
}

function scopedPopupStorageKey(baseKey) {
  return interaction_tab_mode ? baseKey + ':' + interaction_tab_scope : baseKey;
}

var popup_output_storage_key = scopedPopupStorageKey("popup_output_html");
var popup_session_storage_key = scopedPopupStorageKey("popup_session_state");
var skip_popup_output_save = false;
var last_finish_reason = "stop";
var overflow = 0;
var active_llm_xhr = null;
var llm_request_user_aborted = false;
var current_prompt_name = "";
// BEGIN EXTENSION-ONLY LOGGING
var debug_log_entries = [];
var current_debug_entry_id = null;
var debug_log_counter = 0;
var current_run_id = "";
var MAX_PERSISTED_DEBUG_CHARS = 650000;
var MAX_DEBUG_FIELD_PERSIST_CHARS = 90000;
// END EXTENSION-ONLY LOGGING
var MAX_PERSISTED_TRANSCRIPT_CHARS = 1500000;
var MAX_PERSISTED_SESSION_CHARS = 1500000;

// BEGIN EXTENSION-ONLY LOGGING
function debugTimestamp() {
  return new Date().toISOString();
}

function debugDisplayTime(value) {
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (error) {
    return String(value || '');
  }
}

function debugOutputTypeLabel(value) {
  var labels = { '0': 'Prompt', '1': 'LLM', '2': 'JavaScript' };
  return labels[String(value)] || String(value == null ? '' : value);
}

function debugBehaviorLabel(value) {
  var labels = {
    stop: 'FULL STOP', chat: 'CHAT', close: 'CLOSE POP-UP', file: 'SAVE TO FILE', pass: 'DYNAMIC'
  };
  return labels[String(value)] || String(value == null ? '' : value);
}

function debugOutputDestinationLabel(value) {
  var labels = {
    '0': 'Visible', '1': 'Visible + copy to clipboard', '2': 'Visible + append Scratch Pad',
    '3': 'Visible + replace Scratch Pad', '4': 'Hidden', '5': 'Hidden + copy to clipboard',
    '6': 'Hidden + append Scratch Pad', '7': 'Hidden + replace Scratch Pad'
  };
  return labels[String(value)] || String(value == null ? '' : value);
}

function debugVariableNames(source) {
  var names = [];
  String(source || '').replace(/{{([^}]+)}}/g, function(match, name) {
    var cleaned = String(name || '').replace(/\*$/, '').trim();
    if (cleaned && names.indexOf(cleaned) === -1) names.push(cleaned);
    return match;
  });
  return names;
}

function debugContextValuesForTemplate(source) {
  var used = debugVariableNames(source);
  var values = {};
  var scratchText = getScratchText();
  var mappings = {
    highlighted: selectedText,
    nSelectedWords: count_words(selectedText || ''),
    innerText: bodyText,
    nWordsOnPage: count_words(bodyText || ''),
    innerHTML: bodyHTML,
    location: run_location,
    scratch: scratchText,
    passThrough: passThrough
  };
  used.forEach(function(name) {
    var base = name.replace(/\[.*$/, '');
    if (Object.prototype.hasOwnProperty.call(mappings, base)) values[name] = mappings[base];
  });
  return { used: used, values: values };
}

function debugEntryById(id) {
  return debug_log_entries.find(function(item) { return item && item.id === id; }) || null;
}

function currentDebugEntry() {
  return debugEntryById(current_debug_entry_id);
}

function debugPersistSafeValue(value, maxChars) {
  var limit = Number(maxChars) || MAX_DEBUG_FIELD_PERSIST_CHARS;
  if (typeof value === 'string') {
    if (value.length <= limit) return value;
    return value.slice(0, limit) + '\n\n[truncated for popup persistence: ' + (value.length - limit) + ' characters omitted]';
  }
  if (Array.isArray(value)) return value.map(function(item) { return debugPersistSafeValue(item, limit); });
  if (value && typeof value === 'object') {
    var out = {};
    Object.keys(value).forEach(function(key) { out[key] = debugPersistSafeValue(value[key], limit); });
    return out;
  }
  return value;
}

function compactDebugLogForPersistence(entries, maxChars) {
  var source = Array.isArray(entries) ? entries : [];
  var kept = [];
  var used = 0;
  for (var i = source.length - 1; i >= 0; i -= 1) {
    var safe = debugPersistSafeValue(source[i], MAX_DEBUG_FIELD_PERSIST_CHARS);
    var serialized = JSON.stringify(safe);
    if (kept.length && used + serialized.length > maxChars) break;
    kept.unshift(safe);
    used += serialized.length;
  }
  return kept;
}

function resetDebugLogState() {
  debug_log_entries = [];
  current_debug_entry_id = null;
  debug_log_counter = 0;
  current_run_id = "";

  var debugCard = document.getElementById('debug_log_card');
  if (debugCard) debugCard.setAttribute('hidden', 'hidden');
  var debugLink = document.getElementById('logs_toggle');
  if (debugLink) debugLink.setAttribute('aria-expanded', 'false');
  renderDebugLog();
}

// END EXTENSION-ONLY LOGGING

function start_new_popup_run() {
  // A prompt selected from Home is always a new run. Clear any stale persisted
  // transcript/session/log residue before PROMPT 1 is created, but re-enable
  // persistence for the new interaction. Prompt chains, chat turns, retries, and
  // Continue Generation do not call this function and therefore remain in-run.
  skip_popup_output_save = false;
  localStorage.removeItem(popup_output_storage_key);
  localStorage.removeItem(popup_session_storage_key);
  chat_anchor_prompt = "";
  run_has_committed_step = false;
  // BEGIN EXTENSION-ONLY LOGGING
// BEGIN EXTENSION-ONLY LOGGING
  resetDebugLogState();
// END EXTENSION-ONLY LOGGING
  current_run_id = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  // END EXTENSION-ONLY LOGGING
}

// BEGIN EXTENSION-ONLY LOGGING
function beginDebugInteraction(promptName, rawTemplate, templateRecord) {
  if (!current_run_id) current_run_id = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  var inputs = debugContextValuesForTemplate(rawTemplate);
  var record = templateRecord || {};
  debug_log_counter += 1;
  var entry = {
    id: 'log_' + debug_log_counter,
    timestamp: debugTimestamp(),
    promptName: String(promptName || '(unnamed template)'),
    outputType: debugOutputTypeLabel(record.output),
    endpoint: normalize_api_endpoint(record.endpoint) || get_default_api_endpoint(),
    endpointInherited: !String(record.endpoint || '').trim(),
    model: String(record.model || '').trim() || get_default_model(),
    modelInherited: !String(record.model || '').trim(),
    configuredOutputDestination: debugOutputDestinationLabel(record.output_to),
    configuredBehavior: debugBehaviorLabel(record.behavior),
    rawTemplate: String(rawTemplate || ''),
    usedVariables: inputs.used,
    contextValues: inputs.values,
    resolvedPrompt: '',
    questions: [],
    apiCalls: [],
    javascript: null,
    output: null,
    outputHandling: null,
    postRun: null,
    events: []
  };
  debug_log_entries.push(entry);
  current_debug_entry_id = entry.id;
  debugCommit();
  return entry;
}

function debugAddEvent(label, data) {
  var entry = currentDebugEntry();
  if (!entry) return;
  entry.events.push({ timestamp: debugTimestamp(), label: String(label || ''), data: data == null ? null : data });
  debugCommit();
}

function debugSetResolvedPrompt(value) {
  var entry = currentDebugEntry();
  if (!entry) return;
  entry.resolvedPrompt = String(value == null ? '' : value);
  debugCommit();
}

function debugRecordQuestion(question, answer) {
  var entry = currentDebugEntry();
  if (!entry) return;
  entry.questions.push({ question: String(question || ''), answer: String(answer == null ? '' : answer) });
  debugCommit();
}

function debugRecordJavaScript(status, detail) {
  var entry = currentDebugEntry();
  if (!entry) return;
  entry.javascript = { status: status, detail: detail };
  debugCommit();
}

function redactRequestHeaders(headers) {
  var result = {};
  Object.keys(headers || {}).forEach(function(name) {
    result[name] = '[REDACTED]';
  });
  return result;
}

function safeResponseDebugHeaders(xhr) {
  var names = ['content-type', 'x-request-id', 'request-id', 'anthropic-request-id', 'retry-after', 'openai-processing-ms'];
  var out = {};
  names.forEach(function(name) {
    var value = safeResponseHeader(xhr, name);
    if (value) out[name] = value;
  });
  return out;
}

function debugUsageFromResponse(responseText) {
  try {
    var parsed = typeof responseText === 'string' ? JSON.parse(responseText) : responseText;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed.usage || (parsed.response && parsed.response.usage) || null;
  } catch (error) {
    return null;
  }
}

function debugStartApiCall(request, promptText, apiKeyConfigured) {
  var entry = currentDebugEntry();
  if (!entry) return null;
  var call = {
    timestamp: debugTimestamp(),
    startedMs: Date.now(),
    protocol: request.protocol,
    protocolLabel: request.protocolLabel,
    method: 'POST',
    endpoint: api_base,
    model: model,
    apiKey: apiKeyConfigured ? 'configured' : 'missing',
    requestConfig: {
      temperature: temperature === '' ? 'Auto' : temperature,
      maxOutputTokens: max_tokens === '' ? 'Auto' : max_tokens,
      reasoningEffort: reasoning_effort || 'Auto',
      verbosity: verbosity || 'Auto',
      jsonMode: !!(json_mode == 1 || json_mode === true),
      jsonSchema: json_schema || '',
      timeoutSeconds: get_request_timeout_seconds()
    },
    headers: redactRequestHeaders(request.headers),
    promptText: String(promptText || ''),
    rawRequest: request.body,
    status: null,
    statusText: '',
    responseHeaders: {},
    rawResponse: '',
    usage: null,
    elapsedMs: null,
    result: 'pending',
    error: null
  };
  entry.apiCalls.push(call);
  debugCommit();
  return call;
}

function debugFinishApiCall(call, xhr, result, errorDetail) {
  if (!call) return;
  call.elapsedMs = Date.now() - call.startedMs;
  call.status = Number(xhr && xhr.status || 0) || null;
  call.statusText = String(xhr && xhr.statusText || '');
  call.responseHeaders = xhr ? safeResponseDebugHeaders(xhr) : {};
  call.rawResponse = xhr ? String(xhr.responseText || '') : call.rawResponse;
  call.usage = debugUsageFromResponse(call.rawResponse);
  call.result = result || (call.status && call.status >= 200 && call.status < 300 ? 'success' : 'error');
  call.error = errorDetail ? String(errorDetail) : null;
  call.providerError = null;
  if (call.result !== 'success' && call.rawResponse && typeof LitApiAdapters !== 'undefined' && LitApiAdapters.extractError) {
    try {
      var parsedError = LitApiAdapters.extractError(call.rawResponse);
      call.providerError = {
        message: parsedError.message || '',
        code: parsedError.code || '',
        type: parsedError.type || '',
        param: parsedError.param || '',
        requestId: parsedError.requestId || ''
      };
    } catch (error) {}
  }
  debugCommit();
}

function debugRecordOutput(text, finishReason) {
  var entry = currentDebugEntry();
  if (!entry) return;
  entry.output = {
    text: String(text == null ? '' : text),
    finishReason: String(finishReason || 'stop')
  };
  debugCommit();
}

function debugRecordOutputHandling(destination) {
  var entry = currentDebugEntry();
  if (!entry) return;
  entry.outputHandling = debugOutputDestinationLabel(destination);
  debugCommit();
}

function debugRecordPostRun(configured, actual, detail) {
  var entry = currentDebugEntry();
  if (!entry) return;
  var actualText = String(actual || debugBehaviorLabel(configured));
  entry.postRun = {
    configured: entry.configuredBehavior || debugBehaviorLabel(configured),
    actual: actualText,
    detail: detail == null ? '' : String(detail)
  };
  var handoffMatch = actualText.match(/^(CHAIN|DYNAMIC)\s*→\s*(.+)$/);
  if (handoffMatch) {
    entry.postRun.handoff = {
      kind: handoffMatch[1],
      from: entry.promptName || '(unnamed template)',
      to: handoffMatch[2].trim()
    };
  }
  debugCommit();
}

function debugPre(value) {
  var pre = document.createElement('pre');
  pre.className = 'debug-log-pre';
  if (typeof value === 'string') pre.textContent = value;
  else {
    try { pre.textContent = JSON.stringify(value, null, 2); }
    catch (error) { pre.textContent = String(value); }
  }
  return pre;
}

function debugNestedDetails(title, value) {
  var details = document.createElement('details');
  details.className = 'debug-log-details';
  var summary = document.createElement('summary');
  summary.textContent = title;
  details.appendChild(summary);
  details.appendChild(debugPre(value));
  return details;
}

function debugFieldList(fields) {
  var dl = document.createElement('dl');
  dl.className = 'debug-log-fields';
  Object.keys(fields).forEach(function(label) {
    if (fields[label] === '' || fields[label] == null) return;
    var dt = document.createElement('dt');
    dt.textContent = label;
    var dd = document.createElement('dd');
    dd.textContent = typeof fields[label] === 'object' ? JSON.stringify(fields[label]) : String(fields[label]);
    dl.appendChild(dt); dl.appendChild(dd);
  });
  return dl;
}

function debugApiInteractionKind(entry, call, callIndex) {
  var text = String(call && call.promptText || '');
  if (/^You got cutoff\. Pickup where you left off and continue\.$/i.test(text.trim())) return 'CONTINUE GENERATION';
  if (callIndex === 0) return 'INITIAL CALL';
  var calls = entry && Array.isArray(entry.apiCalls) ? entry.apiCalls : [];
  var previous = calls[callIndex - 1];
  if (previous && String(previous.promptText || '') === text) return 'RETRY';
  if (entry && String(entry.configuredBehavior || '').toUpperCase() === 'CHAT') return 'CHAT TURN ' + (callIndex + 1);
  return 'FOLLOW-UP CALL';
}

function renderDebugApiInteraction(container, entry, entryIndex, call, callIndex) {
  var callDetails = document.createElement('details');
  callDetails.className = 'debug-log-api-call debug-log-topline';
  var callSummary = document.createElement('summary');
  var statusText = call.status ? ('HTTP ' + call.status + (call.statusText ? ' ' + call.statusText : '')) : call.result;
  var kind = debugApiInteractionKind(entry, call, callIndex);
  callSummary.textContent = 'API ' + (entryIndex + 1) + '.' + (callIndex + 1) + ' — ' + kind + ' — ' + debugDisplayTime(call.timestamp) + ' — ' + (call.protocolLabel || call.protocol || 'API') + ' — ' + statusText;
  callDetails.appendChild(callSummary);
  callDetails.appendChild(debugFieldList({
    'Method': call.method,
    'Endpoint': call.endpoint,
    'Model': call.model,
    'API key': call.apiKey,
    'Elapsed': call.elapsedMs == null ? '' : call.elapsedMs + ' ms',
    'Result': call.result,
    'Error': call.error,
    'Provider message': call.providerError && call.providerError.message,
    'Error code': call.providerError && call.providerError.code,
    'Error type': call.providerError && call.providerError.type,
    'Parameter': call.providerError && call.providerError.param,
    'Request ID': (call.providerError && call.providerError.requestId) || (call.responseHeaders && (call.responseHeaders['x-request-id'] || call.responseHeaders['request-id'] || call.responseHeaders['anthropic-request-id'])),
    'Usage': call.usage || ''
  }));
  callDetails.appendChild(debugNestedDetails('Prompt / user turn sent', call.promptText || ''));
  callDetails.appendChild(debugNestedDetails('Request configuration', call.requestConfig || {}));
  callDetails.appendChild(debugNestedDetails('Request headers (values redacted)', call.headers || {}));
  callDetails.appendChild(debugNestedDetails('Raw request', call.rawRequest || {}));
  callDetails.appendChild(debugNestedDetails('Response headers', call.responseHeaders || {}));
  callDetails.appendChild(debugNestedDetails('Raw response', call.rawResponse || ''));
  container.appendChild(callDetails);
}

function renderDebugLogEntries(container, entries) {
  if (!container) return;
  container.replaceChildren();
  var source = Array.isArray(entries) ? entries : [];
  if (!source.length) {
    var empty = document.createElement('p');
    empty.className = 'debug-log-empty';
    empty.textContent = 'No interactions logged yet.';
    container.appendChild(empty);
    return;
  }
  source.forEach(function(entry, entryIndex) {
    if (entryIndex > 0) {
      var previousEntry = source[entryIndex - 1];
      var handoff = previousEntry && previousEntry.postRun && previousEntry.postRun.handoff;
      if (handoff) {
        var handoffBanner = document.createElement('div');
        handoffBanner.className = 'debug-log-handoff';
        handoffBanner.setAttribute('role', 'note');
        var handoffLabel = document.createElement('span');
        handoffLabel.className = 'debug-log-handoff-label';
        handoffLabel.textContent = 'HANDOFF: ';
        var handoffRoute = document.createElement('span');
        handoffRoute.className = 'debug-log-handoff-route';
        handoffRoute.textContent = String(handoff.from || previousEntry.promptName || '(unnamed template)') + ' → ' + String(handoff.to || entry.promptName || '(unnamed template)');
        handoffBanner.appendChild(handoffLabel);
        handoffBanner.appendChild(handoffRoute);
        container.appendChild(handoffBanner);
      }
    }

    var details = document.createElement('details');
    details.className = 'debug-log-entry debug-log-topline';
    var summary = document.createElement('summary');
    var status = entry.output && entry.output.finishReason ? entry.output.finishReason : (entry.apiCalls && entry.apiCalls.some(function(c) { return c.result === 'pending'; }) ? 'running' : 'ready');
    summary.textContent = 'PROMPT ' + (entryIndex + 1) + ' — ' + debugDisplayTime(entry.timestamp) + ' — ' + entry.promptName + ' — ' + status;
    details.appendChild(summary);
    details.appendChild(debugFieldList({
      'Output Type': entry.outputType,
      'Endpoint': entry.endpoint + (entry.endpointInherited ? ' (default)' : ''),
      'Model': entry.model + (entry.modelInherited ? ' (default)' : ''),
      'Configured Output': entry.configuredOutputDestination || '',
      'Configured Post-run': entry.configuredBehavior || '',
      'Actual Post-run': entry.postRun ? entry.postRun.actual : ''
    }));
    details.appendChild(debugNestedDetails('Template source', entry.rawTemplate || ''));
    details.appendChild(debugNestedDetails('Resolved prompt', entry.resolvedPrompt || ''));
    details.appendChild(debugNestedDetails('Variables and context', { usedVariables: entry.usedVariables || [], values: entry.contextValues || {}, questions: entry.questions || [] }));
    if (entry.javascript) details.appendChild(debugNestedDetails('JavaScript execution', entry.javascript));
    if (entry.output) details.appendChild(debugNestedDetails('Output', entry.output));
    if (entry.outputHandling) details.appendChild(debugFieldList({ 'Output handling': entry.outputHandling }));
    if (entry.postRun) details.appendChild(debugNestedDetails('Post-run behavior', entry.postRun));
    if (entry.events && entry.events.length) details.appendChild(debugNestedDetails('Runtime events', entry.events));
    container.appendChild(details);

    // API interactions are top-level siblings rather than nested inside the
    // prompt disclosure. This keeps every chat turn, retry, and continuation
    // visible/scannable even while the prompt section itself is collapsed.
    (entry.apiCalls || []).forEach(function(call, callIndex) {
      renderDebugApiInteraction(container, entry, entryIndex, call, callIndex);
    });
  });
}

function renderDebugLog() {
  var container = document.getElementById('debug_log_entries');
  if (container) renderDebugLogEntries(container, debug_log_entries);
}

function debugCommit() {
  renderDebugLog();
  if (!skip_popup_output_save && document.readyState !== 'loading') {
    try { save_popup_session_state(); } catch (error) { console.warn('Unable to persist interaction log:', error); }
  }
}

// END EXTENSION-ONLY LOGGING

function show_transcript_actions() {
  var save = document.getElementById('save_transcript');
  if (save) save.style.display = 'inline';
  // BEGIN EXTENSION-ONLY LOGGING
  var logs = document.getElementById('logs_toggle');
  var separator = document.getElementById('transcript_action_separator');
  if (logs) logs.style.display = 'inline';
  if (separator) separator.style.display = 'inline';
  // END EXTENSION-ONLY LOGGING
}

// BEGIN EXTENSION-ONLY LOGGING
function toggleDebugLog(forceOpen) {
  var card = document.getElementById('debug_log_card');
  var link = document.getElementById('logs_toggle');
  if (!card) return;
  var shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : card.hasAttribute('hidden');
  if (shouldOpen) card.removeAttribute('hidden'); else card.setAttribute('hidden', 'hidden');
  if (link) link.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  if (shouldOpen) renderDebugLog();
}

function debugLogExportHTML() {
  var wrapper = document.createElement('div');
  wrapper.className = 'debug-log-export-wrap';
  var link = document.createElement('a');
  link.href = '#';
  link.id = 'logs_toggle_export';
  link.className = 'transcript-action-link';
  link.textContent = 'LOGS';
  link.setAttribute('aria-expanded', 'false');
  var card = document.createElement('div');
  card.id = 'debug_log_card_export';
  card.className = 'debug-log-card';
  card.setAttribute('hidden', 'hidden');
  var entries = document.createElement('div');
  entries.className = 'debug-log-entries';
  card.appendChild(entries);
  renderDebugLogEntries(entries, debug_log_entries);
  wrapper.appendChild(link);
  wrapper.appendChild(card);
  return wrapper.outerHTML;
}

function transcriptDebugLogScript() {
  return `<script>(function(){var link=document.getElementById('logs_toggle_export');var card=document.getElementById('debug_log_card_export');if(link&&card){link.addEventListener('click',function(e){e.preventDefault();var open=card.hasAttribute('hidden');if(open)card.removeAttribute('hidden');else card.setAttribute('hidden','hidden');link.setAttribute('aria-expanded',open?'true':'false');});}})();<\/script>`;
}

// END EXTENSION-ONLY LOGGING

function get_request_timeout_seconds() {
  var saved = parseInt(localStorage.getItem('request_timeout_seconds') || '120', 10);
  if (!Number.isFinite(saved)) saved = 120;
  return Math.min(600, Math.max(5, saved));
}

function compactMessagesForPersistence(messages, maxChars) {
  var source = Array.isArray(messages) ? messages : [];
  var kept = [];
  var used = 0;
  for (var i = source.length - 1; i >= 0; i -= 1) {
    var item = source[i];
    var size = JSON.stringify(item || {}).length;
    if (kept.length && used + size > maxChars) break;
    kept.unshift(item);
    used += size;
  }
  return kept;
}

function position_stop_generation_control() {
  var stop = document.getElementById('stop_generation');
  var output = document.getElementById('output_window');
  var thinking = document.getElementById('thinking_box');
  var buttonList = document.getElementById('button_list');
  var inner = document.getElementById('inner_wrapper');
  if (!stop || !inner) return;

  var hasTranscriptText = !!(output && String(output.textContent || '').trim());
  if (hasTranscriptText && thinking) {
    // Once the conversation has content, keep Stop generation with the active
    // request indicator instead of making the user jump back to the top.
    thinking.insertAdjacentElement('afterend', stop);
  } else if (buttonList) {
    // On the very first request there is nothing to scroll past, so keep the
    // emergency stop control flush with the top of the interaction area.
    inner.insertBefore(stop, buttonList);
  }
}

function set_generation_active(active) {
  var stop = document.getElementById('stop_generation');
  if (active) position_stop_generation_control();
  if (stop) stop.style.display = active ? 'block' : 'none';
  if (!active) active_llm_xhr = null;
}

function appendStatusMessage(text) {
  var output = document.getElementById('output_window');
  if (!output) return null;
  var div = document.createElement('div');
  div.className = 'msg_text';
  div.textContent = String(text == null ? '' : text);
  output.appendChild(div);
  return div;
}

function appendTranscriptBubble(kind, text) {
  var wrap = document.createElement('div');
  wrap.className = 'text_wrap';
  wrap.id = 'text_' + bubble;
  var bubbleText = document.createElement('div');
  bubbleText.className = kind === 'human' ? 'input_text' : 'output_text';
  var sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = (kind === 'human' ? 'human: ' : 'bot: ');
  bubbleText.appendChild(sr);
  bubbleText.appendChild(document.createTextNode(String(text == null ? '' : text)));
  wrap.appendChild(bubbleText);
  document.getElementById('output_window').appendChild(wrap);
  return wrap;
}

function templateValueToString(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch (error) { return String(value); }
  }
  return String(value);
}

function replaceObjectLookups(source, variableName, value) {
  var escapedName = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var pattern = new RegExp('{{' + escapedName + '\\\["([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"\\\]}}', 'g');
  return String(source || '').replace(pattern, function(match, encodedKey) {
    var key = encodedKey.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    if (value == null || (typeof value !== 'object' && typeof value !== 'string')) return '';
    try {
      var resolved = value[key];
      return templateValueToString(resolved);
    } catch (error) {
      return '';
    }
  });
}

function has_persisted_popup_output() {
  var saved_output = localStorage.getItem(popup_output_storage_key);
  return !!(saved_output && saved_output.trim() !== "");
}

function popup_element_display(id) {
  var element = document.getElementById(id);
  return element ? element.style.display : "";
}

function save_popup_session_state() {
  if (skip_popup_output_save) {
    return;
  }

  var state = {
    question_arry: question_arry,
    last_question: last_question,
    question_: (typeof question_ !== "undefined") ? question_ : "",
    output_type: output_type,
    llm_prompt: llm_prompt,
    llm_messages: compactMessagesForPersistence(llm_messages, 600000),
    chat_anchor_prompt: chat_anchor_prompt,
    LLM_text_collection: LLM_text_collection,
    model: model,
    api_base: api_base,
    template: template,
    temperature: temperature,
    max_tokens: max_tokens,
    reasoning_effort: reasoning_effort,
    verbosity: verbosity,
    json_mode: json_mode,
    json_schema: json_schema,
    json_schema_name: json_schema_name,
    output_to: output_to,
    behavior: behavior,
    passThrough: passThrough,
    bubble: bubble,
    calls: calls,
    run_has_committed_step: run_has_committed_step,
    last_finish_reason: last_finish_reason,
    run_location: run_location,
    overflow: overflow,
    current_prompt_name: current_prompt_name,
// BEGIN EXTENSION-ONLY LOGGING
    current_run_id: current_run_id,
    debug_log_entries: compactDebugLogForPersistence(debug_log_entries, MAX_PERSISTED_DEBUG_CHARS),
// END EXTENSION-ONLY LOGGING
    ui: {
      text_input: popup_element_display('text_input'),
      chat_text_input: popup_element_display('chat_text_input'),
      continue_gen: popup_element_display('continue_gen'),
      credentials: popup_element_display('credentials'),
      restartButton: popup_element_display('restartButton'),
      user_input: document.getElementById('user_input') ? document.getElementById('user_input').value : "",
      chat_user_input: document.getElementById('chat_user_input') ? document.getElementById('chat_user_input').value : ""
    }
  };

  try {
    var serialized = JSON.stringify(state);
    if (serialized.length > MAX_PERSISTED_SESSION_CHARS) {
      console.warn('Popup session is too large to persist safely; leaving the current run in memory only.');
      localStorage.removeItem(popup_session_storage_key);
      return;
    }
    localStorage.setItem(popup_session_storage_key, serialized);
  } catch (error) {
    console.error("Unable to save popup session state:", error);
  }
}

function restore_popup_session_state() {
  var saved_state = localStorage.getItem(popup_session_storage_key);
  if (!saved_state) {
    return false;
  }

  try {
    var state = JSON.parse(saved_state);
    question_arry = state.question_arry || {};
    last_question = state.last_question || "";
    if (Object.prototype.hasOwnProperty.call(state, 'question_')) {
      question_ = state.question_;
    }
    output_type = Object.prototype.hasOwnProperty.call(state, 'output_type') ? state.output_type : output_type;
    llm_prompt = state.llm_prompt || "";
    llm_messages = Array.isArray(state.llm_messages) ? state.llm_messages : [];
    chat_anchor_prompt = state.chat_anchor_prompt || "";
    LLM_text_collection = state.LLM_text_collection || "";
    model = state.model || "";
    api_base = normalize_api_endpoint(state.api_base) || get_default_api_endpoint();
    template = state.template || "";
    temperature = Object.prototype.hasOwnProperty.call(state, 'temperature') ? state.temperature : temperature;
    max_tokens = Object.prototype.hasOwnProperty.call(state, 'max_tokens') ? state.max_tokens : max_tokens;
    reasoning_effort = Object.prototype.hasOwnProperty.call(state, 'reasoning_effort') ? state.reasoning_effort : reasoning_effort;
    verbosity = Object.prototype.hasOwnProperty.call(state, 'verbosity') ? state.verbosity : verbosity;
    json_mode = Object.prototype.hasOwnProperty.call(state, 'json_mode') ? state.json_mode : json_mode;
    json_schema = Object.prototype.hasOwnProperty.call(state, 'json_schema') ? state.json_schema : json_schema;
    json_schema_name = state.json_schema_name || json_schema_name;
    output_to = Object.prototype.hasOwnProperty.call(state, 'output_to') ? state.output_to : output_to;
    behavior = Object.prototype.hasOwnProperty.call(state, 'behavior') ? state.behavior : behavior;
    passThrough = Object.prototype.hasOwnProperty.call(state, 'passThrough') ? state.passThrough : passThrough;
    bubble = Number.isFinite(Number(state.bubble)) ? Number(state.bubble) : bubble;
    calls = Number.isFinite(Number(state.calls)) ? Number(state.calls) : 0;
    run_has_committed_step = state.run_has_committed_step === true || Number(state.bubble) > 0 ||
      (Array.isArray(state.llm_messages) && state.llm_messages.length > 0) || !!state.LLM_text_collection;
    last_finish_reason = state.last_finish_reason || "stop";
    run_location = state.run_location || "";
    bodyHTML = ""; // Re-acquire page HTML from the active tab instead of persisting large page markup.
    overflow = Number(state.overflow) === 1 ? 1 : 0;
    current_prompt_name = state.current_prompt_name || "";
// BEGIN EXTENSION-ONLY LOGGING
    current_run_id = state.current_run_id || (state.debug_log_entries && state.debug_log_entries.length ? 'legacy_run' : "");
    debug_log_entries = Array.isArray(state.debug_log_entries) ? state.debug_log_entries : [];
    debug_log_counter = debug_log_entries.reduce(function(maxValue, item) {
      var match = item && String(item.id || '').match(/^log_(\d+)$/);
      return match ? Math.max(maxValue, parseInt(match[1], 10)) : maxValue;
    }, 0);
    current_debug_entry_id = debug_log_entries.length ? debug_log_entries[debug_log_entries.length - 1].id : null;
    var debugCard = document.getElementById('debug_log_card');
    if (debugCard) debugCard.setAttribute('hidden', 'hidden');
    var debugLink = document.getElementById('logs_toggle');
    if (debugLink) debugLink.setAttribute('aria-expanded', 'false');
    renderDebugLog();
// END EXTENSION-ONLY LOGGING

    var controlled_ids = ['text_input', 'chat_text_input', 'continue_gen', 'credentials', 'restartButton', 'stop_generation'];
    controlled_ids.forEach(function(id) {
      var element = document.getElementById(id);
      if (element) {
        element.style.display = 'none';
      }
    });
    document.getElementById('thinking_box').style.display = 'none';

    if (state.ui) {
      controlled_ids.forEach(function(id) {
        var element = document.getElementById(id);
        if (element && state.ui[id] && state.ui[id] !== 'none') {
          element.style.display = state.ui[id];
        }
      });
      if (document.getElementById('user_input')) {
        document.getElementById('user_input').value = state.ui.user_input || "";
      }
      if (document.getElementById('chat_user_input')) {
        document.getElementById('chat_user_input').value = state.ui.chat_user_input || "";
      }
    }
    suppressStandaloneTerminalForComposer();

    // A popup that closed while an API call was in flight cannot keep that XHR alive.
    // Restore a usable post-run control rather than leaving the reopened popup stranded.
    var has_action = controlled_ids.some(function(id) {
      var element = document.getElementById(id);
      return element && element.style.display !== 'none' && element.style.display !== '';
    });
    if (!has_action) {
      if (behavior === 'chat' && llm_messages.length > 0) {
        document.getElementById('chat_text_input').style.display = 'block';
        suppressStandaloneTerminalForComposer();
      } else if (last_finish_reason === 'length') {
        document.getElementById('continue_gen').style.display = 'block';
        document.getElementById('restartButton').style.display = 'block';
      } else {
        document.getElementById('restartButton').style.display = 'block';
      }
    }

    // A Continue generation state must always offer a way back to the template home screen.
    var continue_control = document.getElementById('continue_gen');
    if (continue_control && continue_control.style.display !== 'none' && continue_control.style.display !== '') {
      document.getElementById('restartButton').style.display = 'block';
    }

    return true;
  } catch (error) {
    console.error("Unable to restore popup session state:", error);
    return false;
  }
}

function save_popup_output() {
  if (skip_popup_output_save) {
    return;
  }
  var output_window = document.getElementById('output_window');
  if (output_window) {
    try {
      var html = output_window.innerHTML;
      if (html.length <= MAX_PERSISTED_TRANSCRIPT_CHARS) {
        localStorage.setItem(popup_output_storage_key, html);
      } else {
        localStorage.removeItem(popup_output_storage_key);
        console.warn('Transcript is too large to persist safely; it will remain visible until the popup closes.');
      }
    } catch (error) {
      console.error('Unable to persist popup transcript:', error);
    }
  }
  save_popup_session_state();
}

function setSafePersistedHTML(target, html) {
  if (!target) return;
  var templateNode = document.createElement('template');
  templateNode.innerHTML = String(html || '');
  templateNode.content.querySelectorAll('script, iframe, object, embed, link, meta').forEach(function(node) { node.remove(); });
  templateNode.content.querySelectorAll('*').forEach(function(node) {
    Array.from(node.attributes || []).forEach(function(attribute) {
      var name = String(attribute.name || '').toLowerCase();
      var value = String(attribute.value || '').trim().toLowerCase();
      if (name.indexOf('on') === 0 || ((name === 'href' || name === 'src') && value.indexOf('javascript:') === 0)) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  target.replaceChildren(templateNode.content.cloneNode(true));
}

function scroll_restored_popup_to_bottom() {
  var isExtensionPopup = false;
  try {
    isExtensionPopup = !!(typeof LitPlatform !== 'undefined' && LitPlatform.isExtensionContext && LitPlatform.isExtensionContext());
  } catch (error) {
    isExtensionPopup = false;
  }
  if (!isExtensionPopup) return;

  // Popup dimensions settle after persisted transcript/session HTML is restored.
  // Wait through two animation frames, then put a reopened in-progress run at
  // the newest content instead of the top of a long interaction.
  var doScroll = function() {
    var scrollingElement = document.scrollingElement || document.documentElement || document.body;
    if (!scrollingElement) return;
    scrollingElement.scrollTop = scrollingElement.scrollHeight;
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo(0, scrollingElement.scrollHeight);
    }
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(function() {
      requestAnimationFrame(doScroll);
    });
  } else {
    setTimeout(doScroll, 0);
  }
}

function restore_popup_output() {
  var output_window = document.getElementById('output_window');
  var saved_output = localStorage.getItem(popup_output_storage_key);

  if (!output_window || !saved_output) {
    return;
  }

  setSafePersistedHTML(output_window, saved_output);
  output_window.querySelectorAll('.output_text').forEach(function(item) {
    if (!item.querySelector('.sr-only')) {
      item.insertAdjacentHTML('afterbegin', "<span class='sr-only'>bot: </span>");
    }
  });
  output_window.querySelectorAll('.input_text').forEach(function(item) {
    if (!item.querySelector('.sr-only')) {
      item.insertAdjacentHTML('afterbegin', "<span class='sr-only'>human: </span>");
    }
  });
  document.getElementById('button_list').style.display = 'none';
  document.getElementById('transcript').style.display = 'block';
  show_transcript_actions();

  var restored_session = restore_popup_session_state();
  if (!restored_session) {
    // Output from the previous persistence-only build has no saved conversation state.
    // Keep it visible, hide the initial menu, and offer an explicit fresh start.
    document.getElementById('restartButton').style.display = 'block';
  }

  // Keep generated bubble IDs unique when new output is appended after restoring.
  var max_bubble = 0;
  output_window.querySelectorAll('[id^="text_"]').forEach(function(item) {
    var match = item.id.match(/^text_(\d+)$/);
    if (match) {
      max_bubble = Math.max(max_bubble, parseInt(match[1], 10));
    }
  });
  bubble = max_bubble;
  scroll_restored_popup_to_bottom();
}

function clear_popup_output() {
  skip_popup_output_save = true;
  localStorage.removeItem(popup_output_storage_key);
  localStorage.removeItem(popup_session_storage_key);
  // BEGIN EXTENSION-ONLY LOGGING
  resetDebugLogState();
  // END EXTENSION-ONLY LOGGING
}

function clear_and_close_popup(close_delay_ms) {
  // Clear first so beforeunload cannot restore the just-finished run. A small
  // optional delay is useful after triggering a download, giving the browser
  // time to accept the save before navigating/closing.
  clear_popup_output();

  var delay = Number(close_delay_ms) || 0;
  var is_extension_popup = false;
  try {
    is_extension_popup = !!(typeof LitPlatform !== 'undefined' && LitPlatform.isExtensionContext());
  } catch (error) {
    is_extension_popup = false;
  }

  // In exported interactions.html / interactions_w_scratch.html files, CLOSE
  // POP-UP and SAVE TO FILE should behave exactly like Back Home: keep the page
  // open, clear the completed run, and return to the initial prompt menu.
  if (!is_extension_popup) {
    var return_home = function() { location.reload(); };
    if (delay > 0) {
      setTimeout(return_home, delay);
    } else {
      return_home();
    }
    return;
  }

  var close_popup = async function() {
    // Persistent interaction tabs are real browser tabs, not toolbar popups.
    // Close the current tab explicitly so CLOSE POP-UP / SAVE TO FILE retain
    // their intended terminal behavior in this mode.
    if (interaction_tab_mode && typeof LitPlatform !== 'undefined' && typeof LitPlatform.closeCurrentTab === 'function') {
      try {
        await LitPlatform.closeCurrentTab();
        return;
      } catch (error) {
        console.warn('Unable to close the interaction tab through the tabs API:', error);
      }
    }

    window.close();
    // Defensive fallback: if an extension surface refuses to close, return Home.
    setTimeout(function() {
      if (!window.closed) {
        location.reload();
      }
    }, 50);
  };

  if (delay > 0) {
    setTimeout(function() { close_popup(); }, delay);
  } else {
    close_popup();
  }
}

popup_CSS = `* {
  box-sizing: border-box;
}

input:focus-visible, textarea:focus-visible, button:focus-visible, select:focus-visible, a:focus-visible {
  outline: 2px solid #1d4ed8;
  outline-offset: 2px;
}

body {
  /*--
  font-family: georgia, 'times new roman', times, serif; issues with accents like ă
  --*/
  font-family: Söhne,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif,Helvetica Neue,Arial,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;
  box-sizing: border-box;
}

#scratch_pad {
  box-sizing: border-box;
  width:100%;
  height:100%;
  padding:20px;
  border:0px solid #ccc;
  resize: none;
  overflow-y: auto;
}

.sr-only {
  position: absolute !important;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.text_wrap{
  float:left;
  width:100%;
  margin:0;
  padding:0;
}

.input_text {
  float:right;
  font-size: 16px;
  line-height: 20px;
  margin: 0px 5px 15px 0;
  max-width:100%;
  margin-left:20%;
  background:#eee;
  border-radius:8px;
  padding:15px;
}

.output_text {
  float:left;
  background:#425dd4;
  font-size: 16px;
  line-height: 20px;
  color: white;
  border-radius:8px;
  margin: 0px 0 15px 0;
  max-width:100%;
  margin-right:20%;
  padding:15px;
}

code {
  background:#2c3e8e;
}

.code_wrapper {
  padding:3px;
  margin: 0px;
  width:100%;
  overflow-x: auto;
  background:#2c3e8e;
}

.msg_text {
  float:left;
  font-family: Verdana, Geneva, sans-serif;
  font-variant: small-caps;
  width:100%;
  text-align: center;
  font-size: 14px;
  color:#7d7878;
  margin:0 0 15px 0;
}

.output_text.rich-output {
  float:left;
  width:100%;
  max-width:100%;
  margin:0 0 15px 0;
  padding:0;
  background:transparent;
  color:#111827;
  border-radius:0;
}

.output-prose {
  width:fit-content;
  max-width:80%;
  margin:0 20% 10px 0;
  padding:15px;
  border-radius:8px;
  background:#425dd4;
  color:white;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
}

.output-prose:last-child { margin-bottom:0; }

.markdown-body { white-space:normal; }
.markdown-body > :first-child { margin-top:0; }
.markdown-body > :last-child { margin-bottom:0; }
.markdown-body p { margin:0 0 .7em 0; }
.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin:.85em 0 .4em 0;
  line-height:1.2;
  color:inherit;
}
.markdown-body h1 { font-size:1.4em; }
.markdown-body h2 { font-size:1.28em; }
.markdown-body h3 { font-size:1.16em; }
.markdown-body h4, .markdown-body h5, .markdown-body h6 { font-size:1em; }
.markdown-body ul, .markdown-body ol { margin:0 0 .75em 1.35em; padding:0; }
.markdown-body li { margin:.18em 0; }
.markdown-body blockquote {
  margin:.25em 0 .75em 0;
  padding:.15em 0 .15em .8em;
  border-left:3px solid rgba(255,255,255,.6);
}
.markdown-body blockquote > :last-child { margin-bottom:0; }
.markdown-body a { color:#fff; text-decoration:underline; text-underline-offset:2px; }
.markdown-body a:focus-visible { outline:2px solid #fff; outline-offset:2px; }
.markdown-body hr { border:0; border-top:1px solid rgba(255,255,255,.55); margin:.85em 0; }
.inline-code {
  padding:1px 4px;
  border-radius:4px;
  background:#2c3e8e;
  color:white;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  font-size:.92em;
}

.code-card {
  float:left;
  width:100%;
  margin:0 0 10px 0;
  border:1px solid #374151;
  border-radius:8px;
  overflow:hidden;
  background:#111827;
  color:#f8fafc;
  text-align:left;
}

.code-card-header {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  min-height:34px;
  padding:5px 7px 5px 10px;
  background:#1f2937;
  border-bottom:1px solid #374151;
}
.code-language { font:600 12px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
.code-card-controls { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
.code-card-button {
  min-width:0;
  padding:2px 6px;
  border:1px solid #64748b;
  border-radius:4px;
  background:#f8fafc;
  color:#111827;
  font-size:11px;
  line-height:18px;
  cursor:pointer;
}
.code-card-button:focus-visible { outline:2px solid #fff; outline-offset:1px; }
.code-card-body { width:100%; overflow:auto; }
.code-pre {
  margin:0;
  padding:12px;
  max-height:320px;
  overflow:auto;
  background:#111827;
  color:#f8fafc;
  white-space:pre;
  tab-size:2;
}
.code-block {
  display:block;
  min-width:max-content;
  background:transparent !important;
  color:inherit;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  font-size:12.5px;
  line-height:1.5;
}
.code-card.is-wrapped .code-pre { white-space:pre-wrap; overflow-wrap:anywhere; }
.code-card.is-wrapped .code-block { min-width:0; }
.code-card.is-expanded {
  position:fixed;
  inset:10px;
  z-index:2147483646;
  margin:0;
  display:flex;
  flex-direction:column;
  width:auto;
  max-width:none;
  max-height:none;
  box-shadow:0 0 0 9999px rgba(0,0,0,.58);
}
.code-card.is-expanded .code-card-body { flex:1; min-height:0; }
.code-card.is-expanded .code-pre { max-height:none; height:100%; }
body.code-modal-open { overflow:hidden; }
.code-token-comment { color:#94a3b8; }
.code-token-string { color:#fde68a; }
.code-token-keyword { color:#93c5fd; }
.code-token-number { color:#f0abfc; }

.transcript-actions { float:left; width:100%; display:flex; align-items:center; justify-content:center; gap:7px; margin:0 0 15px 0; }
.transcript-control-link, .transcript-action-link {
  font-family:Verdana,Geneva,sans-serif; font-variant:normal; text-transform:uppercase;
  text-align:center; font-size:13px; line-height:1.25; color:#7d7878; margin:0; text-decoration:underline;
}
.transcript-control-link { display:none; flex:0 0 auto; }
.transcript-action-separator { display:none; flex:0 0 auto; font-family:Verdana,Geneva,sans-serif; font-size:13px; line-height:1.25; color:#7d7878; }
.transcript-action-link { display:block; width:100%; margin:0 0 10px 0; }
/* BEGIN EXTENSION-ONLY LOGGING */
.debug-log-card { float:left; width:100%; margin:0 0 15px 0; padding:10px; border:1px solid #b8b8b8; border-radius:6px; background:#f5f5f5; color:#1f2937; }
.debug-log-card[hidden] { display:none !important; }
.debug-log-card h3 { margin:0 0 8px 0; font-size:15px; }
.debug-log-entry, .debug-log-api-call, .debug-log-details { margin:6px 0; }
.debug-log-topline { border:1px solid #c7ced8; border-radius:5px; background:#fff; overflow:hidden; }
.debug-log-topline > summary { padding:7px 9px; font-weight:700; cursor:pointer; background:#e8eef5; }
.debug-log-api-call.debug-log-topline > summary { background:#f4f6f8; }
.debug-log-topline > .debug-log-fields, .debug-log-topline > .debug-log-details { margin-left:8px; margin-right:8px; }
.debug-log-topline > .debug-log-fields:last-child, .debug-log-topline > .debug-log-details:last-child { margin-bottom:8px; }
.debug-log-details > summary { font-weight:600; cursor:pointer; }
.debug-log-fields { display:grid; grid-template-columns:max-content 1fr; column-gap:8px; row-gap:3px; margin:8px 0; font-size:12px; }
.debug-log-fields dt { font-weight:700; }
.debug-log-fields dd { margin:0; min-width:0; overflow-wrap:anywhere; }
.debug-log-pre { max-height:320px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; background:#fff; border:1px solid #d4d4d4; border-radius:4px; padding:8px; font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
.debug-log-empty { margin:0; font-size:12px; }
.debug-log-handoff { margin:9px 0; padding:7px 9px; border:1px solid #94a3b8; border-left-width:4px; border-radius:5px; background:#e8eef5; font:12px/1.35 Verdana,Geneva,sans-serif; overflow-wrap:anywhere; }
.debug-log-handoff-label { font-weight:700; letter-spacing:.04em; }
.debug-log-handoff-route { font-weight:600; }
/* END EXTENSION-ONLY LOGGING */

}`

//
// General functions
//

function start_spinner(target_id) {
  var opts = {
    lines: 13, // The number of lines to draw
    length: 7, // The length of each line
    width: 4, // The line thickness
    radius: 10, // The radius of the inner circle
    corners: 1, // Corner roundness (0..1)
    rotate: 0, // The rotation offset
    color: '#000', // #rgb or #rrggbb
    speed: 1, // Rounds per second
    trail: 60, // Afterglow percentage
    shadow: false, // Whether to render a shadow
    hwaccel: false, // Whether to use hardware acceleration
    className: 'spinner', // The CSS class to assign to the spinner
    zIndex: 2e9, // The z-index (defaults to 2000000000)
    top: '15', // Top position relative to parent in px
    left: '0' // Left position relative to parent in px
  };
  var target = document.getElementById(target_id);
  var spinner = new Spinner(opts).spin(target);
}

document.addEventListener('DOMContentLoaded', function () {

  installCodeCardControls(document);

  var myButton = document.getElementById('send');
  myButton.addEventListener('click', function() {
    submit_text();
  });  

  var myChatAns = document.getElementById('chat_user_input');
  myChatAns.addEventListener('keydown', submitChatOnEnter);  

  var myChatButton = document.getElementById('chat_send');
  myChatButton.addEventListener('click', function() {
    submit_chat_text();
  });    

  var myContinueButton = document.getElementById('continueButton');
  myContinueButton.addEventListener('click', function() {
    submit_continue();
  });    

  var stopGenerationButton = document.getElementById('stopGenerationButton');
  if (stopGenerationButton) {
    stopGenerationButton.addEventListener('click', function() {
      if (active_llm_xhr) {
        llm_request_user_aborted = true;
        active_llm_xhr.abort();
      }
    });
  }

  var credentialsButton = document.getElementById('credentialsButton');
  credentialsButton.addEventListener('click', function() {
    saveAPICred();
  });

  document.getElementById("api_base").addEventListener("keydown", saveOnEnter);
  document.getElementById("api_key").addEventListener("keydown", saveOnEnter);

  function reportNavigationError(label, error) {
    console.error('Unable to open ' + label + ':', error);
    alert('Unable to open ' + label + '. Please try again or reload the extension.');
  }

  var mySettings = document.getElementById('config');
  mySettings.addEventListener('click', function() {
    LitPlatform.openOptionsPage().catch(function(error) {
      reportNavigationError('Templates & Settings', error);
    });
  });

  var myScratch = document.getElementById('scratch');
  myScratch.addEventListener('click', function() {
    LitPlatform.openInternalPage('scratch.html', 'scratch').catch(function(error) {
      reportNavigationError('Scratch Pad', error);
    });
  });

  var myAbout = document.getElementById('about');
  myAbout.addEventListener('click', function() {
    LitPlatform.openExternalPage('https://github.com/SuffolkLITLab/prompts', '_projectPage').catch(function(error) {
      reportNavigationError('About', error);
    });
  });

  var myFeedback = document.getElementById('feedback');
  myFeedback.addEventListener('click', function() {
    LitPlatform.openExternalPage('https://github.com/SuffolkLITLab/prompts/issues', '_logIssues').catch(function(error) {
      reportNavigationError('Feedback', error);
    });
  });

// BEGIN EXTENSION-ONLY LOGGING
  var logsToggle = document.getElementById('logs_toggle');
  if (logsToggle) {
    logsToggle.addEventListener('click', function(event) {
      event.preventDefault();
      toggleDebugLog();
    });
  }

// END EXTENSION-ONLY LOGGING
  var save_transcript = document.getElementById('save_transcript');
  save_transcript.addEventListener('click', function() {
      const d = new Date();
      const day_list = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const month_list = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      saved_on =  day_list[d.getDay()] + ", " + month_list[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();

      transcript_html = "<html>\n<head>\n<title>Transcript: "+ saved_on +"</title><style>\n"+popup_CSS+"\n</style>\n</head>\n<body>\n";
      transcript_html += document.getElementById('transcript').innerHTML;
      transcript_html += "<div class='msg_text'>Saved "+saved_on+" at " + (d.getHours() % 12 || 12) + ":" + ('0' + d.getMinutes()).slice(-2) + " " + (d.getHours() >= 12 ? 'pm' : 'am') + (run_location ? "<br>" + accountForHTML(run_location) : "") + "</div>"
// BEGIN EXTENSION-ONLY LOGGING
      transcript_html += debugLogExportHTML();
// END EXTENSION-ONLY LOGGING
      transcript_html += transcriptCodeControlsScript();
// BEGIN EXTENSION-ONLY LOGGING
      transcript_html += transcriptDebugLogScript();
// END EXTENSION-ONLY LOGGING
      transcript_html += "\n</body>\n</html>";
      saveTextAsFile(transcript_html, timestampedDownloadFilename("transcript_", "html", d))
  });

  function activateTerminalControl() {
    if (interaction_tab_mode) {
      clear_and_close_popup();
      return;
    }
    clear_popup_output();
    location.reload();
  }

  function updateTerminalControlLabels() {
    var label = interaction_tab_mode ? 'CLOSE' : 'Back Home';
    ["restartButton", "restartButton_companion", "restartButton_companion_chat"].forEach(function(id) {
      var control = document.getElementById(id);
      if (control) {
        control.textContent = label;
        control.setAttribute('aria-label', interaction_tab_mode ? 'Close interaction tab' : 'Back Home');
      }
    });
  }

  updateTerminalControlLabels();

  document.getElementById("restartButton").addEventListener("click", activateTerminalControl);

  ["restartButton_companion", "restartButton_companion_chat"].forEach(function(id) {
    var restart = document.getElementById(id);
    if (restart) restart.addEventListener("click", activateTerminalControl);
  });

//FOR EXPORT:   if (!localStorage.scratch_pad) {
//FOR EXPORT:     localStorage.setItem('scratch_pad',"")
//FOR EXPORT:   } else {
//FOR EXPORT:      document.getElementById('scratch_pad').value = localStorage.scratch_pad
//FOR EXPORT:   }  

  function initializeSplitPaneResize() {
    var panel = document.getElementById("main_wrapper");
    var scratchPanel = document.getElementById("inline_scratch");
    var handle = document.getElementById("panel_resize_handle");
    if (!panel || !scratchPanel || !handle) return;

    // Horizontal resizing belongs only to the standalone Scratch Pad +
    // Interactions export. The extension popup and interactions-only export
    // deliberately keep this handle inactive so text selection can never
    // accidentally resize their content column.
    var isExtension = Boolean(window.LitPlatform && window.LitPlatform.isExtensionContext && window.LitPlatform.isExtensionContext());
    var scratchVisible = window.getComputedStyle(scratchPanel).display !== "none";
    if (isExtension || !scratchVisible || window.innerWidth <= 450) {
      handle.style.display = "none";
      return;
    }

    var MIN_INTERACTIONS_WIDTH = 180;
    var MIN_SCRATCH_WIDTH = 90;
    var pointerId = null;

    function clampWidth(width) {
      var maxWidth = Math.max(MIN_INTERACTIONS_WIDTH, window.innerWidth - MIN_SCRATCH_WIDTH);
      return Math.min(maxWidth, Math.max(MIN_INTERACTIONS_WIDTH, Math.round(width)));
    }

    function applyWidth(width, persist) {
      width = clampWidth(width);
      panel.style.width = width + "px";
      scratchPanel.style.right = width + "px";
      handle.style.right = (width - 4) + "px";
      handle.setAttribute("aria-valuemin", String(MIN_INTERACTIONS_WIDTH));
      handle.setAttribute("aria-valuemax", String(Math.max(MIN_INTERACTIONS_WIDTH, window.innerWidth - MIN_SCRATCH_WIDTH)));
      handle.setAttribute("aria-valuenow", String(width));
      if (persist) localStorage.setItem("split_panel_w", String(width));
    }

    var savedWidth = Number(localStorage.getItem("split_panel_w"));
    if (!Number.isFinite(savedWidth) || savedWidth <= 0) {
      // Migrate a valid numeric value from the older panel_w setting, while
      // ignoring legacy values such as "100%" written by the popup.
      var legacy = localStorage.getItem("panel_w");
      if (legacy && /^\d+(?:\.\d+)?$/.test(legacy)) savedWidth = Number(legacy);
    }
    if (!Number.isFinite(savedWidth) || savedWidth <= 0) savedWidth = window.innerWidth * 0.39;
    applyWidth(savedWidth, false);

    handle.addEventListener("pointerdown", function(e) {
      if (e.button !== 0) return;
      pointerId = e.pointerId;
      handle.setPointerCapture(pointerId);
      document.body.classList.add("split-pane-resizing");
      e.preventDefault();
    });

    handle.addEventListener("pointermove", function(e) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      applyWidth(window.innerWidth - e.clientX, true);
    });

    function finishResize(e) {
      if (pointerId === null || (e && e.pointerId !== pointerId)) return;
      try { handle.releasePointerCapture(pointerId); } catch (_) {}
      pointerId = null;
      document.body.classList.remove("split-pane-resizing");
    }
    handle.addEventListener("pointerup", finishResize);
    handle.addEventListener("pointercancel", finishResize);

    handle.addEventListener("keydown", function(e) {
      var width = parseInt(window.getComputedStyle(panel).width, 10);
      if (!Number.isFinite(width)) return;
      if (e.key === "ArrowLeft") {
        applyWidth(width + 20, true);
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        applyWidth(width - 20, true);
        e.preventDefault();
      }
    });

    window.addEventListener("resize", function() {
      if (window.innerWidth <= 450) {
        handle.style.display = "none";
        panel.style.width = "";
        scratchPanel.style.right = "";
        return;
      }
      handle.style.display = "block";
      var width = parseInt(window.getComputedStyle(panel).width, 10);
      if (!Number.isFinite(width)) width = Number(localStorage.getItem("split_panel_w")) || window.innerWidth * 0.39;
      applyWidth(width, false);
    });
  }

  initializeSplitPaneResize();

  // Save text to localStorage on change
  document.getElementById('scratch_pad').addEventListener('input', function() {
    setScratchText(this.value);
    current_text = this.value;
  });

  // Restore prior popup output and keep subsequent output changes persistent.
  restore_popup_output();
  var output_window = document.getElementById('output_window');
  var output_observer = new MutationObserver(function() {
    save_popup_output();
  });
  output_observer.observe(output_window, { childList: true, subtree: true, characterData: true });
  window.addEventListener('beforeunload', save_popup_output);

});

//
// Construct, submit, and handel prompts
//

//
// JavaScript-template runtime
//

async function javascript_runtime_state(request_if_missing=false) {
  if (typeof LitPlatform === "undefined") {
    return {
      ready: false,
      message: "JavaScript templates require the browser extension; standalone HTML exports cannot execute user scripts."
    };
  }

  return await LitPlatform.getJavaScriptTemplateSupport({ requestPermission: request_if_missing });
}

function template_chain_uses_javascript(start_choice) {
  var visited = {};
  var has_any_javascript = Object.keys(templates || {}).some(function(name) {
    return Number(templates[name] && templates[name].output) === 2;
  });

  function walk(choice) {
    if (!choice || visited[choice] || !templates || !templates[choice]) return false;
    visited[choice] = true;

    var item = templates[choice];
    if (Number(item.output) === 2) return true;

    var next = item.behavior;
    if (next === "pass") {
      // DYNAMIC can choose any template at runtime, so request permission up front if JS exists at all.
      return has_any_javascript;
    }
    if (next === "stop" || next === "file" || next === "chat" || !next) return false;
    return walk(next);
  }

  return walk(start_choice);
}


function template_chain_uses_context_variable(start_choice, variable_names) {
  var visited = {};
  var names = Array.isArray(variable_names) ? variable_names.filter(Boolean) : [];
  if (!names.length) return false;

  function sourceUsesVariable(item) {
    var source = String((item && item.prompt) || '');
    if (Number(item && item.output) === 2) {
      // JavaScript templates use context variables directly rather than through
      // double-curly placeholders. Match identifiers conservatively.
      return names.some(function(name) {
        return new RegExp('\\b' + String(name).replace(/[^a-zA-Z0-9_$]/g, '') + '\\b').test(source);
      });
    }
    return names.some(function(name) {
      return source.indexOf('{{' + name + '}}') >= 0;
    });
  }

  var anyTemplateUsesVariable = Object.keys(templates || {}).some(function(name) {
    return sourceUsesVariable(templates[name]);
  });

  function walk(choice) {
    if (!choice || visited[choice] || !templates || !templates[choice]) return false;
    visited[choice] = true;
    var item = templates[choice];
    if (sourceUsesVariable(item)) return true;

    var next = item.behavior;
    if (next === 'pass') return anyTemplateUsesVariable;
    if (next === 'stop' || next === 'file' || next === 'chat' || next === 'close' || !next) return false;
    return walk(next);
  }

  return walk(start_choice);
}

function parse_javascript_scratch() {
  var raw = getScratchText();
  if (!raw.trim()) return raw;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return raw;
  }
}

function count_words(text) {
  var matches = String(text || "").match(/\b(\w+)\b/g);
  return matches ? matches.length : 0;
}

function javascript_template_context() {
  var d = new Date();
  var day_list = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var month_list = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  return {
    passThrough: passThrough,
    scratch: parse_javascript_scratch(),
    highlighted: selectedText || "",
    innerText: bodyText || "",
    innerHTML: bodyHTML || "",
    location: run_location || "",
    nSelectedWords: count_words(selectedText),
    nWordsOnPage: count_words(bodyText),
    coinFlip: ["heads", "tails"][Math.floor(Math.random() * 2)],
    d4: Math.floor(Math.random() * 4) + 1,
    d6: Math.floor(Math.random() * 6) + 1,
    d8: Math.floor(Math.random() * 8) + 1,
    dPercent: Math.floor(Math.random() * 11),
    d12: Math.floor(Math.random() * 12) + 1,
    d20: Math.floor(Math.random() * 20) + 1,
    dayOfWeek: d.getDay(),
    DayOfWeek: day_list[d.getDay()],
    month: d.getMonth(),
    month1: d.getMonth() + 1,
    month2d: ("0" + (d.getMonth() + 1)).slice(-2),
    Month: month_list[d.getMonth()],
    day: d.getDate(),
    day2d: ("0" + d.getDate()).slice(-2),
    year: d.getFullYear(),
    hours24: d.getHours(),
    hours242d: ("0" + d.getHours()).slice(-2),
    hours: (d.getHours() % 12 || 12),
    hours2d: ("0" + (d.getHours() % 12 || 12)).slice(-2),
    ampm: d.getHours() >= 12 ? "pm" : "am",
    minutes: d.getMinutes(),
    minutes2d: ("0" + d.getMinutes()).slice(-2),
    seconds: d.getSeconds(),
    seconds2d: ("0" + d.getSeconds()).slice(-2)
  };
}

function javascript_output_text(value) {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  return JSON.stringify(value, null, 2);
}

function stop_javascript_template_with_error(message) {
  console.error(message);
  // BEGIN EXTENSION-ONLY LOGGING
  debugRecordJavaScript('error', String(message || ''));
  // END EXTENSION-ONLY LOGGING
  output_to = 0;
  behavior = "stop";
  json_mode = 0;
  after_build("JavaScript Error: " + message);
}

async function run_javascript_template(source_code) {
  var runtime = await javascript_runtime_state(false);
  if (!runtime.ready) {
    stop_javascript_template_with_error(runtime.message);
    return;
  }

  try {
    var active_tab;
    if (prompt_context_tab_id != null && typeof LitPlatform.getTab === 'function') {
      try {
        active_tab = await LitPlatform.getTab(prompt_context_tab_id);
      } catch (error) {
        throw new Error('The original page for this interaction tab is no longer available. JavaScript templates cannot run against a closed source tab.');
      }
    } else {
      active_tab = await LitPlatform.getActiveTab();
    }

    var context = javascript_template_context();
    var encoded_context = encodeURIComponent(JSON.stringify(context));
    var context_literal = JSON.stringify(encoded_context);

    // The user's source runs inside an async function so `await` and explicit `return` both work.
    // Inputs are transferred as encoded JSON rather than interpolated into the user's source.
    var wrapped_source = `(async () => {
  const __litInputs = JSON.parse(decodeURIComponent(${context_literal}));
  const passThrough = __litInputs.passThrough;
  const scratch = __litInputs.scratch;
  const highlighted = __litInputs.highlighted;
  const innerText = __litInputs.innerText;
  const innerHTML = __litInputs.innerHTML;
  const location = __litInputs.location;
  const nSelectedWords = __litInputs.nSelectedWords;
  const nWordsOnPage = __litInputs.nWordsOnPage;
  const coinFlip = __litInputs.coinFlip;
  const d4 = __litInputs.d4;
  const d6 = __litInputs.d6;
  const d8 = __litInputs.d8;
  const dPercent = __litInputs.dPercent;
  const d12 = __litInputs.d12;
  const d20 = __litInputs.d20;
  const dayOfWeek = __litInputs.dayOfWeek;
  const DayOfWeek = __litInputs.DayOfWeek;
  const month = __litInputs.month;
  const month1 = __litInputs.month1;
  const month2d = __litInputs.month2d;
  const Month = __litInputs.Month;
  const day = __litInputs.day;
  const day2d = __litInputs.day2d;
  const year = __litInputs.year;
  const hours24 = __litInputs.hours24;
  const hours242d = __litInputs.hours242d;
  const hours = __litInputs.hours;
  const hours2d = __litInputs.hours2d;
  const ampm = __litInputs.ampm;
  const minutes = __litInputs.minutes;
  const minutes2d = __litInputs.minutes2d;
  const seconds = __litInputs.seconds;
  const seconds2d = __litInputs.seconds2d;

  try {
    const __litValue = await (async () => {
${source_code}
    })();

    if (typeof __litValue === "undefined") {
      throw new Error("JavaScript templates must explicitly return a value; this template returned undefined.");
    }
    if (["function", "symbol", "bigint"].includes(typeof __litValue)) {
      throw new Error("The returned value must be JSON-compatible; received " + typeof __litValue + ".");
    }

    const __litJson = JSON.stringify(__litValue);
    if (typeof __litJson === "undefined") {
      throw new Error("The returned value could not be represented as JSON-compatible data.");
    }
    const __litPortableValue = JSON.parse(__litJson);
    return JSON.stringify({ ok: true, value: __litPortableValue });
  } catch (__litError) {
    return JSON.stringify({
      ok: false,
      error: (__litError && __litError.stack) ? __litError.stack : String(__litError)
    });
  }
})()`;

    var execution_results = await LitPlatform.executeUserScript({
      js: [{ code: wrapped_source }],
      target: { tabId: active_tab.id },
      world: "USER_SCRIPT",
      injectImmediately: true
    });

    var execution = (execution_results || []).find(function(item) { return item.frameId === 0; }) || (execution_results || [])[0];
    if (!execution) throw new Error("The browser returned no result from the JavaScript template.");
    if (execution.error) throw new Error(String(execution.error));
    if (typeof execution.result !== "string") {
      throw new Error("The browser returned an unexpected JavaScript-template result.");
    }

    var envelope = JSON.parse(execution.result);
    if (!envelope.ok) {
      throw new Error(envelope.error || "The JavaScript template failed without an error message.");
    }

    var result_value = envelope.value;
    var output_text = javascript_output_text(result_value);
    // BEGIN EXTENSION-ONLY LOGGING
    debugRecordJavaScript('success', { result: result_value });
    // END EXTENSION-ONLY LOGGING
    after_build(output_text, "stop", result_value, true);
  } catch (error) {
    stop_javascript_template_with_error(error && error.message ? error.message : String(error));
  }
}

function stop_prompt_before_execution() {
  // If the very first prompt is canceled/invalid before anything has actually
  // begun, there is no run to recover. Return directly to Home (or close a
  // persistent interaction tab, whose Home-origin popup was already reset).
  // Later failures in an established chain keep the transcript and terminal
  // control so earlier work remains available.
  if (!run_has_committed_step) {
    calls = 0;
    if (interaction_tab_mode) {
      clear_and_close_popup();
    } else {
      clear_popup_output();
      location.reload();
    }
    return;
  }

  // Any later prompt that aborts during template/context preprocessing should
  // leave the current run in the same recoverable terminal state as FULL STOP.
  // This matters especially for the final template in a prompt chain: there is
  // no later output event that would otherwise add Back Home/CLOSE.
  try { document.getElementById('thinking_box').style.display = 'none'; } catch (error) {}
  try { set_generation_active(false); } catch (error) {}
  try { document.getElementById('button_list').style.display = 'none'; } catch (error) {}
  try { document.getElementById('transcript').style.display = 'block'; } catch (error) {}
  calls = 0;
  insert_restart();
  save_popup_output();
}

function choose_prompt(choice) {

  if (!choice || !templates || !templates[choice]) {
    alert('No matching prompt found for "' + String(choice || '') + '". Returning Home.');
    calls = 0;
    insert_restart();
    save_popup_output();
    return;
  }

  calls+=1;
  console.log("Choosing template: "+choice)
  console.log("Runs w/o interaction: "+calls)

  if (calls>=20) {
    if (confirm(`Are you in a loop? You've made 20 prompt calls without human interaction. Choose "OK" to continue or "Cancel" to stop here.`) == true) {
      calls = 0;
    } else {
      insert_restart();
    }
  }

  if (calls<20) {

    output_type = templates[choice]["output"]
    template = templates[choice]["prompt"];
    api_base = normalize_api_endpoint(templates[choice]["endpoint"]) || get_default_api_endpoint();
    model = String(templates[choice]["model"] || "").trim() || get_default_model();
    max_tokens = Object.prototype.hasOwnProperty.call(templates[choice], "max_tokens") ? templates[choice]["max_tokens"] : ""; // Provider-neutral output token cap
    temperature = Object.prototype.hasOwnProperty.call(templates[choice], "temperature") ? templates[choice]["temperature"] : ""; // Blank means provider/model default
    reasoning_effort = templates[choice]["reasoning_effort"] || "";
    verbosity = templates[choice]["verbosity"] || "";
    json_mode = templates[choice]["json_mode"];
    json_schema = templates[choice]["json_schema"] || "";
    json_schema_name = String(choice || "structured_response")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 64) || "structured_response";
    output_to = templates[choice]["output_to"];
    behavior = templates[choice]["behavior"];
    current_prompt_name = String(choice || "");
    llm_prompt = template
    // BEGIN EXTENSION-ONLY LOGGING
    beginDebugInteraction(current_prompt_name, template, templates[choice]);

    // END EXTENSION-ONLY LOGGING
    if (Number(output_type) === 2) {
      console.log("Mode: JavaScript");
      // BEGIN EXTENSION-ONLY LOGGING
      debugSetResolvedPrompt(String(template || ''));
      // END EXTENSION-ONLY LOGGING
      // BEGIN EXTENSION-ONLY LOGGING
      debugAddEvent('JavaScript template started', { outputTo: debugOutputDestinationLabel(output_to), postRun: debugBehaviorLabel(behavior) });
      // END EXTENSION-ONLY LOGGING
      LLM_text_collection = "";
      document.getElementById('button_list').style.display='none';
      document.getElementById('transcript').style.display='block';
      document.getElementById('thinking_box').style.display='block';

      if (!template || !String(template).trim()) {
        stop_javascript_template_with_error("Empty JavaScript source. Open Templates & Settings and add code to this template.");
      } else {
        run_has_committed_step = true;
        run_javascript_template(String(template));
      }
      return;
    }

    // remove comments
    llm_prompt = llm_prompt.replace(/\[\#[\s\S]*?\#\]/g, "");

    if (llm_prompt){
      abandon_prompt = 0;
      // Place selected text into template
      if (selectedText=="" && template.match(/{{highlighted}}/g)) {
        console.log("Unable to find Highlighted / Selected text for this page.");
        if (confirm('Unable to find Highlighted / Selected text for this page. Choose "OK" to continue with an empty value or "Cancel" to stop this prompt.') == true) {
          llm_prompt = llm_prompt.replace(/{{highlighted}}/g, ""); 
          llm_prompt = llm_prompt.replace(/{{nSelectedWords}}/g, 0); 
        } else {
          abandon_prompt = 1;
        }
      } else {
        if (selectedText.length>0) {
          llm_prompt = llm_prompt.replace(/{{highlighted}}/g, selectedText.replace(/({|})/g, "\\$1")); 
          llm_prompt = llm_prompt.replace(/{{nSelectedWords}}/g, count_words(selectedText)); 
        } else {
          llm_prompt = llm_prompt.replace(/{{highlighted}}/g, ""); 

          llm_prompt = llm_prompt.replace(/{{nSelectedWords}}/g, 0); 
        }
      }

      if (abandon_prompt == 0) {
        // Place page text into template
        if (bodyText=="" && template.match(/{{innerText}}/g)) {
          console.log("Unable to parse innerText for this page.");
          if (confirm('Unable to parse innerText for this page. Choose "OK" to continue with an empty value or "Cancel" to stop this prompt.') == true) {
            llm_prompt = llm_prompt.replace(/{{innerText}}/g, "");
            llm_prompt = llm_prompt.replace(/{{nWordsOnPage}}/g, 0);
          } else {
            abandon_prompt = 1;
          }
        } else {
          if (bodyText.length>0) {
            llm_prompt = llm_prompt.replace(/{{innerText}}/g, bodyText.replace(/({|})/g, "\\$1"));
            llm_prompt = llm_prompt.replace(/{{nWordsOnPage}}/g, count_words(bodyText));
          } else {
            llm_prompt = llm_prompt.replace(/{{innerText}}/g, "");
            llm_prompt = llm_prompt.replace(/{{nWordsOnPage}}/g, 0);
          }
        }

        // Place page HTML into template. This mirrors innerText but preserves markup.
        if (abandon_prompt == 0) {
          if (bodyHTML == "" && template.match(/{{innerHTML}}/g)) {
            console.log("Unable to parse innerHTML for this page.");
            if (confirm('Unable to parse innerHTML for this page. Choose "OK" to continue with an empty value or "Cancel" to stop this prompt.') == true) {
              llm_prompt = llm_prompt.replace(/{{innerHTML}}/g, "");
            } else {
              abandon_prompt = 1;
            }
          } else {
            llm_prompt = llm_prompt.replace(/{{innerHTML}}/g, (bodyHTML || "").replace(/({|})/g, "\\$1"));
          }
        }

        // Expose the active page URL using the same captured location used by transcript metadata.
        if (abandon_prompt == 0) {
          llm_prompt = llm_prompt.replace(/{{location}}/g, String(run_location || "").replace(/({|})/g, "\\$1"));
        }
      }

    } else {
      alert(`Can't read prompt. Please check its contents by clicking "Templates & Settings" below.`)
      abandon_prompt = 1;

    }

    if (abandon_prompt == 0) {
      // Place Scratch Pad text into template. Missing scratch storage is an
      // empty string, never the literal text "null".
      var scratchText = getScratchText();
      llm_prompt = llm_prompt.replace(/{{scratch}}/g, scratchText);
      var scratchValue = scratchText;
      if (scratchText.trim()) {
        try {
          scratchValue = JSON.parse(scratchText);
        } catch (error) {
          scratchValue = scratchText;
        }
      }
      llm_prompt = replaceObjectLookups(llm_prompt, 'scratch', scratchValue);

      if (passThrough !== null && typeof passThrough === "object") {
        llm_prompt = llm_prompt.replace(/{{passThrough}}/g, JSON.stringify(passThrough));
      } else {
        llm_prompt = llm_prompt.replace(/{{passThrough}}/g, templateValueToString(passThrough));
      }
      llm_prompt = replaceObjectLookups(llm_prompt, 'passThrough', passThrough);

      // ------------------------------------------------------
      // Add predefined variables to the the template
      // ------------------------------------------------------
    
      // Coin
      flip = Math.floor(Math.random() * 2)
      flip_out = ["heads","tails"]
      llm_prompt = llm_prompt.replace(/{{coinFlip}}/g,flip_out[flip]);
      // Dice 
      roll = Math.floor(Math.random() * 4) + 1
      llm_prompt = llm_prompt.replace(/{{d4}}/g,roll);
      roll = Math.floor(Math.random() * 6) + 1
      llm_prompt = llm_prompt.replace(/{{d6}}/g,roll);
      roll = Math.floor(Math.random() * 8) + 1
      llm_prompt = llm_prompt.replace(/{{d8}}/g,roll);
      roll = Math.floor(Math.random() * 11)
      llm_prompt = llm_prompt.replace(/{{d%}}/g,roll);
      roll = Math.floor(Math.random() * 12) + 1
      llm_prompt = llm_prompt.replace(/{{d12}}/g,roll);
      roll = Math.floor(Math.random() * 20) + 1
      llm_prompt = llm_prompt.replace(/{{d20}}/g,roll);

      // Dates 
      const d = new Date();
      const day_list = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      llm_prompt = llm_prompt.replace(/{{dayOfWeek}}/g, d.getDay()); // number
      llm_prompt = llm_prompt.replace(/{{DayOfWeek}}/g, day_list[d.getDay()]); // english
      const month_list = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      llm_prompt = llm_prompt.replace(/{{month}}/g, d.getMonth()); // zero-indexed number (0-11)
      llm_prompt = llm_prompt.replace(/{{month1}}/g, d.getMonth()+1); // one-indexed number (1-12)
      llm_prompt = llm_prompt.replace(/{{month2d}}/g, ('0'  + (d.getMonth()+1)).slice(-2)); // padded one-indexed number
      llm_prompt = llm_prompt.replace(/{{Month}}/g, month_list[d.getMonth()]); // english
      llm_prompt = llm_prompt.replace(/{{day}}/g, d.getDate()); // day of month
      llm_prompt = llm_prompt.replace(/{{day2d}}/g, ('0'  + d.getDate()).slice(-2)); // day of month
      llm_prompt = llm_prompt.replace(/{{year}}/g, d.getFullYear()); // YEAR
      llm_prompt = llm_prompt.replace(/{{hours24}}/g, d.getHours()); // hours (out of 24)
      llm_prompt = llm_prompt.replace(/{{hours242d}}/g, ('0'  + d.getHours()).slice(-2)); // hours (out of 24)
      llm_prompt = llm_prompt.replace(/{{hours}}/g, (d.getHours() % 12 || 12)); // hours (out of 12)
      llm_prompt = llm_prompt.replace(/{{hours2d}}/g, ('0'  + (d.getHours() % 12 || 12)).slice(-2)); // hours (out of 12)
      llm_prompt = llm_prompt.replace(/{{ampm}}/g, d.getHours() >= 12 ? 'pm' : 'am');
      llm_prompt = llm_prompt.replace(/{{minutes}}/g, d.getMinutes());
      llm_prompt = llm_prompt.replace(/{{minutes2d}}/g, ('0'  + d.getMinutes()).slice(-2));
      llm_prompt = llm_prompt.replace(/{{seconds}}/g, d.getSeconds());
      llm_prompt = llm_prompt.replace(/{{seconds2d}}/g, ('0'  + d.getSeconds()).slice(-2));

      if (llm_prompt.trim()=="") {
        alert(`Error: Empty prompt. Please check its contents by clicking "Templates & Settings" below.`)
        abandon_prompt = 1;
      } else {
        build_prompt();
      }
      
    }

    if (abandon_prompt != 0) {
      stop_prompt_before_execution();
    }
  }

}

function scroll2Q(id) {
  show_transcript_actions();

  if (bubble>0) {
    var top = document.getElementById(id).offsetTop; //Getting Y of target element
    console.log("Jump to Y for ("+id+"): "+top);
    //adapted from https://github.com/Yappli/smooth-scroll
    moving_frequency = 0.75
    var getScrollTopDocumentAtBegin = document.documentElement.scrollTop + document.body.scrollTop;
    console.log("Y:",top,getScrollTopDocumentAtBegin)
    var hop_count = Math.round((top - getScrollTopDocumentAtBegin)/moving_frequency)
    var gap = (top - getScrollTopDocumentAtBegin) / hop_count;
    for(var i = 1; i <= hop_count; i++)
        {
          (function()
            {
              var hop_top_position = gap*i;
                setTimeout(function(){  window.scrollTo(0, hop_top_position + getScrollTopDocumentAtBegin); }, moving_frequency*i);
              })();
        }
  }
}

function build_prompt() {
  // Reaching build_prompt means preprocessing/context resolution succeeded and
  // the run has genuinely begun (including prompts that now need user input).
  run_has_committed_step = true;
  console.log("Building prompt...");
  LLM_text_collection = "";
      
  // Make a list of all other variables (i.e. text of the form {{variable}}). 
  var questions = llm_prompt.match(/{{[^}]+}}/g)

  console.log("Questions:",questions)
  document.getElementById('button_list').style.display='none';
  document.getElementById('transcript').style.display='block';

  // Loop through each variable and present it as a question
  if (questions) {
    for (question of questions) {
      last_question = question;
      if ((!question_arry[question]) || (question.match(/\*}}$/))) {
        question_ = question.replace(/\*}}$/,"}}")
        question_ = question_.replace(/{|}/g,"");
        if (document.getElementById('thinking_box').style.display=="block") {
          setTimeout(() => {
            document.getElementById('thinking_box').style.display='none';
  set_generation_active(false);
            document.getElementById('text_input').style.display='block';
            suppressStandaloneTerminalForComposer();
            document.getElementById('user_input').focus();
            bubble+=1;
            appendTranscriptBubble('bot', question_);
            scroll2Q("text_"+bubble);
            document.getElementById("user_input").addEventListener("keydown", submitOnEnter);
          }, 300);        
        } else {
          document.getElementById('thinking_box').style.display='none';
          document.getElementById('text_input').style.display='block';
          suppressStandaloneTerminalForComposer();
          document.getElementById('user_input').focus();
          bubble+=1;
          appendTranscriptBubble('bot', question_);
          scroll2Q("text_"+bubble);
          document.getElementById("user_input").addEventListener("keydown", submitOnEnter);
        }
        break
      } else {
        llm_prompt = llm_prompt.replaceAll(last_question,question_arry[last_question]);
        build_prompt(0);
        break
      }
    }
  } else {

    document.getElementById('thinking_box').style.display='block';

    // Count the words in the prompt
    words = count_words(llm_prompt);
    characters = llm_prompt.length;
    token_est = Math.round(words*1.75)

    console.log("Words in prompt: "+words+" (~"+token_est+" tokens)\nMODEL: "+model+"\nPROMPT:\n\n"+llm_prompt)
    // BEGIN EXTENSION-ONLY LOGGING
    debugSetResolvedPrompt(llm_prompt);
    // END EXTENSION-ONLY LOGGING
    // BEGIN EXTENSION-ONLY LOGGING
    debugAddEvent('Prompt resolved', { words: words, estimatedTokens: token_est });

    // END EXTENSION-ONLY LOGGING
    if (output_type==1) {
      console.log("Mode: Calling LLM")
      // CHAT prompts need the fully resolved initial prompt to remain available
      // for every later user turn. Keep an explicit anchor separate from the
      // mutable conversation array so persistent interaction tabs, reloads, or
      // future history compaction cannot reduce the conversation to only the
      // assistant summary plus the user's follow-up.
      if (behavior === "chat") {
        chat_anchor_prompt = String(llm_prompt || "");
      } else {
        chat_anchor_prompt = "";
      }
      openai_call(llm_prompt)
    } else {
      console.log("Mode: Prompt only")
      after_build(llm_prompt)
    }
    
  }
}

function submit_text() {
  
  answer =  document.getElementById('user_input').value;
  if (answer.length>0) {
    console.log("Sending text...")
    calls=0;
    document.getElementById('text_input').style.display='none'
    document.getElementById('thinking_box').style.display='block';
    bubble+=1;
    appendTranscriptBubble('human', answer);
    scroll2Q("text_"+bubble);
    llm_prompt = llm_prompt.replaceAll(last_question, answer);
    question_arry[last_question] = answer;
    // BEGIN EXTENSION-ONLY LOGGING
    debugRecordQuestion(question_, answer);
    // END EXTENSION-ONLY LOGGING
    console.log("Q: "+question_+"\nA: "+answer);
    document.getElementById('user_input').value = "";
    build_prompt(0);  
  } else {
    alert("You cannot leave this input blank.");
    document.getElementById('user_input').focus();
  }
}

function saveAPICred() {
  const enteredEndpoint = normalize_api_endpoint(document.getElementById('api_base').value) || api_base || get_default_api_endpoint();
  const enteredKey = document.getElementById('api_key').value || '';
  api_base = enteredEndpoint;
  remember_api_key_for_endpoint(enteredEndpoint, enteredKey);
  document.getElementById('credentials').style.display='none';
  // Standalone exports treat Save Credentials as the recovery action itself:
  // persist the corrected key, clear the failed run, and return to Home. The
  // export's embedded credentials are defaults only, so this saved value will
  // still win after the reload.
  //FOR EXPORT: clear_popup_output();
  //FOR EXPORT: location.reload();
  //FOR EXPORT: return;
  appendStatusMessage('credentials saved');
  insert_restart();
}

function saveOnEnter(event) {
  if (event.which === 13) {
      if (!event.repeat) {
        saveAPICred()
      }
      event.preventDefault(); // Prevents the addition of a new line in the text field
  }
}

function submitOnEnter(event) {
  if (!event.shiftKey && event.which === 13) {
      if (!event.repeat) {
        submit_text();
      }
      event.preventDefault(); // Prevents the addition of a new line in the text field
  }
}

function submit_chat_text() {
  answer =  document.getElementById('chat_user_input').value;
  if (answer.length>0) {
    console.log("Sending text...")
    calls=0;
    document.getElementById('chat_text_input').style.display='none'
    document.getElementById('thinking_box').style.display='block';
    bubble+=1;
    appendTranscriptBubble('human', answer);
    scroll2Q("text_"+bubble);
    document.getElementById('chat_user_input').value = "";
    // BEGIN EXTENSION-ONLY LOGGING
    debugAddEvent('Chat continuation', { userText: answer });
    // END EXTENSION-ONLY LOGGING
    openai_call(answer)  
  } else {
    alert("You cannot leave this input blank.");
    document.getElementById('user_input').focus();
  }
}

function submitChatOnEnter(event) {
  if (!event.shiftKey && event.which === 13) {
      if (!event.repeat) {
        submit_chat_text();
      }
      event.preventDefault(); // Prevents the addition of a new line in the text field
  }
}

function submit_continue() {
  console.log("Sending continue request...")
  calls=0;
  document.getElementById('continue_gen').style.display='none';
  document.getElementById('thinking_box').style.display='block';
  // BEGIN EXTENSION-ONLY LOGGING
  debugAddEvent('Continue generation requested');
  // END EXTENSION-ONLY LOGGING
  openai_call("You got cutoff. Pickup where you left off and continue.")  
}

function safeResponseHeader(xhr, name) {
  try { return String(xhr.getResponseHeader(name) || '').trim(); } catch (error) { return ''; }
}

function httpStatusLabel(xhr) {
  const status = Number(xhr && xhr.status || 0);
  const statusText = String(xhr && xhr.statusText || '').trim();
  if (!status) return 'LLM request failed';
  return 'HTTP ' + status + (statusText ? ' ' + statusText : '');
}

function formatLlmApiError(xhr, apiError, fallbackError) {
  const info = apiError || {};
  const status = Number(xhr && xhr.status || 0);
  const heading = status >= 200 && status < 300
    ? 'ERROR: The LLM returned a response that LIT Prompting could not use (' + httpStatusLabel(xhr) + ').'
    : 'ERROR: LLM request failed (' + httpStatusLabel(xhr) + ').';
  const lines = [heading];
  const providerMessage = String(info.message || (fallbackError && fallbackError.message) || '').trim();
  const code = String(info.code || '').trim();
  const type = String(info.type || '').trim();
  const param = String(info.param || '').trim();
  const responseRequestId = String(info.requestId || '').trim();
  const headerRequestId = safeResponseHeader(xhr, 'x-request-id') ||
    safeResponseHeader(xhr, 'request-id') || safeResponseHeader(xhr, 'anthropic-request-id');
  const requestId = responseRequestId || headerRequestId;

  if (providerMessage) lines.push('', '**Provider message:** ' + providerMessage);
  if (code) lines.push('**Error code:** `' + code.replace(/`/g, '\\`') + '`');
  if (type && type !== code) lines.push('**Error type:** `' + type.replace(/`/g, '\\`') + '`');
  if (param) lines.push('**Parameter:** `' + param.replace(/`/g, '\\`') + '`');
  if (requestId) lines.push('**Request ID:** `' + requestId.replace(/`/g, '\\`') + '`');

  var hint = '';
  if (typeof LitApiAdapters !== 'undefined' && LitApiAdapters.getErrorHint) {
    hint = LitApiAdapters.getErrorHint(info, {
      status: xhr && xhr.status,
      endpoint: api_base,
      model: model,
      protocol: null
    });
  }
  if (hint) lines.push('', '**Suggestion:** ' + hint);
  lines.push('', 'You can edit the endpoint, API key, model, and advanced request settings in Templates & Settings.');
  return lines.join('\n');
}

function ensure_chat_anchor_in_history(prompt_text) {
  if (behavior !== "chat" || !chat_anchor_prompt || String(prompt_text || "") === chat_anchor_prompt) return false;

  // Defensive repair for CHAT continuity. Normally the initial resolved prompt
  // is already the first user message. If that message was lost because of a
  // reload/restore edge case, put the original source-bearing prompt back at
  // the front before sending the follow-up. This is especially important for
  // Run in New Tab prompts whose first message may contain a large {{innerText}}.
  var has_chat_anchor = llm_messages.some(function(message) {
    return message && message.role === "user" && String(message.content || "") === chat_anchor_prompt;
  });
  if (has_chat_anchor) return false;

  llm_messages.unshift({"role": "user", "content": chat_anchor_prompt});
  // BEGIN EXTENSION-ONLY LOGGING
  debugAddEvent('CHAT context repaired', { reason: 'Initial resolved prompt was missing from conversation history.' });
  // END EXTENSION-ONLY LOGGING
  return true;
}

async function openai_call(prompt_text) {

  await api_key_ready;
  const request_api_key = get_api_key_for_endpoint(api_base);

  if (behavior!="chat") {
    llm_messages = [];
    chat_anchor_prompt = "";
  } else {
    ensure_chat_anchor_in_history(prompt_text);
  }

  llm_messages.push({"role": "user", "content": prompt_text});

  var request;
  try {
    if (typeof LitApiAdapters === "undefined") throw new Error("The API adapter layer did not load.");
    request = LitApiAdapters.buildRequest({
      endpoint: api_base,
      apiKey: request_api_key,
      model: model,
      messages: llm_messages,
      temperature: temperature,
      maxTokens: max_tokens,
      reasoningEffort: reasoning_effort,
      verbosity: verbosity,
      jsonMode: json_mode,
      jsonSchema: json_schema,
      jsonSchemaName: json_schema_name
    });
  } catch (error) {
    llm_messages.pop();
    console.error("Unable to build API request:", error);
    // BEGIN EXTENSION-ONLY LOGGING
    debugAddEvent('API request construction failed', { message: String(error && error.message || error) });
    // END EXTENSION-ONLY LOGGING
    var build_detail = String(error && error.message || '').trim();
    LLM_text = (json_mode==1 || json_mode===true)
      ? "ERROR: The JSON Schema saved for this prompt is not valid JSON, or the API request could not be constructed."
      : "ERROR: The API request could not be constructed.";
    if (build_detail) LLM_text += "\n\n**Details:** " + build_detail;
    LLM_text += "\n\nOpen Templates & Settings and check the endpoint, API key, model, and prompt settings.";
    output_to = 0;
    behavior = "stop";
    after_build(LLM_text);
    return;
  }

  console.log("API protocol: " + request.protocolLabel);
  console.log(request.body);
  // BEGIN EXTENSION-ONLY LOGGING
  var debug_api_call = debugStartApiCall(request, prompt_text, !!String(request_api_key || '').trim());
  // END EXTENSION-ONLY LOGGING

  var xhr = new XMLHttpRequest();
  active_llm_xhr = xhr;
  llm_request_user_aborted = false;

  function removePendingUserTurn() {
    if (llm_messages.length && llm_messages[llm_messages.length - 1].role === 'user' && llm_messages[llm_messages.length - 1].content === prompt_text) {
      llm_messages.pop();
    }
  }

  try {
    xhr.open("POST", api_base);
    xhr.timeout = get_request_timeout_seconds() * 1000;
    Object.entries(request.headers).forEach(function(header) { xhr.setRequestHeader(header[0], header[1]); });
  } catch (error) {
    removePendingUserTurn();
    set_generation_active(false);
    output_to = 0;
    behavior = 'stop';
    var open_detail = String(error && error.message || '').trim();
    var open_message = 'ERROR: The API endpoint could not be opened. Check the endpoint URL in Templates & Settings.';
    if (open_detail) open_message += '\n\n**Details:** ' + open_detail;
    // BEGIN EXTENSION-ONLY LOGGING
    debugFinishApiCall(debug_api_call, null, 'open_error', open_detail || open_message);
    // END EXTENSION-ONLY LOGGING
    after_build(open_message);
    return;
  }
  set_generation_active(true);

  xhr.onload = function () {
    set_generation_active(false);
    try {
      console.log(xhr.responseText);
      if (xhr.status < 200 || xhr.status >= 300) throw new Error('HTTP ' + xhr.status);
      var parsed = LitApiAdapters.extractResponse(api_base, xhr.responseText);
      // BEGIN EXTENSION-ONLY LOGGING
      debugFinishApiCall(debug_api_call, xhr, 'success');
      // END EXTENSION-ONLY LOGGING
      LLM_text = parsed.text;
      llm_messages.push({"role": "assistant", "content": LLM_text});
      after_build(LLM_text, parsed.finishReason);
    } catch (error) {
      removePendingUserTurn();
      // BEGIN EXTENSION-ONLY LOGGING
      if (debug_api_call && debug_api_call.result !== 'success') debugFinishApiCall(debug_api_call, xhr, 'error', error && error.message);
      // END EXTENSION-ONLY LOGGING
      var api_error = LitApiAdapters.extractError(xhr.responseText);
      var error_message = String(api_error.message || (error && error.message) || "");
      var error_code = String(api_error.code || api_error.type || "");
      var context_error = /context|token limit|too many tokens|prompt is too long/i.test(error_code + " " + error_message);
      if (context_error) {
        LLM_text = llm_messages.length==0
          ? "ERROR: The prompt and its expected reply exceeds the token limit for this model."
          : "ERROR: Over the course of this chat, you have reached the token limit for this model.";
        output_to=0; behavior="stop"; after_build(LLM_text);
      } else if ((request.protocol === "openai_chat" || request.protocol === "openai_responses") &&
          (output_type==1) && (json_mode==1 || json_mode===true) &&
          /(response_format|text\.format|json_schema|json object)/i.test(error_message)) {
        console.log("Endpoint rejected its structured-output parameter; trying again without the JSON flag...");
        // BEGIN EXTENSION-ONLY LOGGING
        debugAddEvent('Structured JSON retry', { reason: error_message, retryWithoutJsonFlag: true });
        // END EXTENSION-ONLY LOGGING
        json_mode = 2;
        openai_call(prompt_text);
      } else {
        console.error("LLM API error:", { status: xhr.status, error: api_error, fallback: error });
        LLM_text = formatLlmApiError(xhr, api_error, error);
        output_to=0; behavior="stop"; after_build(LLM_text);
        //FOR EXPORT: document.getElementById("restartButton").remove();
        //FOR EXPORT: document.getElementById('credentials').style.display='block';
        //FOR EXPORT: document.getElementById('api_base').value = api_base || get_default_api_endpoint();
        //FOR EXPORT: document.getElementById('api_key').value = get_api_key_for_endpoint(api_base) || "";
        //FOR EXPORT: document.getElementById('api_key').focus();
      }
    }
  };

  xhr.onerror = function() {
    // BEGIN EXTENSION-ONLY LOGGING
    debugFinishApiCall(debug_api_call, xhr, 'network_error', 'Network error');
    // END EXTENSION-ONLY LOGGING
    set_generation_active(false);
    removePendingUserTurn();
    output_to = 0;
    behavior = 'stop';
    after_build('ERROR: The LLM request could not reach the configured endpoint. Check your connection and endpoint settings.');
  };

  xhr.ontimeout = function() {
    // BEGIN EXTENSION-ONLY LOGGING
    debugFinishApiCall(debug_api_call, xhr, 'timeout', 'Timed out after ' + get_request_timeout_seconds() + ' seconds');
    // END EXTENSION-ONLY LOGGING
    set_generation_active(false);
    removePendingUserTurn();
    output_to = 0;
    behavior = 'stop';
    after_build('ERROR: The LLM request timed out after ' + get_request_timeout_seconds() + ' seconds. You can increase Request Timeout in Templates & Settings.');
  };

  xhr.onabort = function() {
    // BEGIN EXTENSION-ONLY LOGGING
    debugFinishApiCall(debug_api_call, xhr, 'aborted', 'Generation stopped by user');
    // END EXTENSION-ONLY LOGGING
    set_generation_active(false);
    removePendingUserTurn();
    if (llm_request_user_aborted) {
      llm_request_user_aborted = false;
      document.getElementById('thinking_box').style.display='none';
      appendStatusMessage('Generation stopped.');
      calls = 0;
      insert_restart();
      save_popup_output();
    }
  };

  try {
    xhr.send(JSON.stringify(request.body));
  } catch (error) {
    removePendingUserTurn();
    // BEGIN EXTENSION-ONLY LOGGING
    debugFinishApiCall(debug_api_call, null, 'send_error', error && error.message);
    // END EXTENSION-ONLY LOGGING
    set_generation_active(false);
    output_to = 0;
    behavior = 'stop';
    after_build('ERROR: The LLM request could not be sent. Check the endpoint and request settings.');
    return;
  }
  return xhr;
}

function accountForHTML(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


function normalizeCodeLanguage(raw_language) {
  var raw = String(raw_language || "").trim().split(/\s+/)[0].toLowerCase();
  var aliases = {
    js: ["javascript", "JavaScript"], javascript: ["javascript", "JavaScript"], jsx: ["javascript", "JavaScript"],
    ts: ["typescript", "TypeScript"], typescript: ["typescript", "TypeScript"], tsx: ["typescript", "TypeScript"],
    py: ["python", "Python"], python: ["python", "Python"],
    json: ["json", "JSON"], jsonc: ["json", "JSON"],
    html: ["html", "HTML"], htm: ["html", "HTML"], xml: ["html", "XML"],
    css: ["css", "CSS"], scss: ["css", "SCSS"],
    sh: ["bash", "Shell"], bash: ["bash", "Shell"], shell: ["bash", "Shell"], zsh: ["bash", "Shell"],
    sql: ["sql", "SQL"],
    md: ["markdown", "Markdown"], markdown: ["markdown", "Markdown"],
    yaml: ["yaml", "YAML"], yml: ["yaml", "YAML"],
    c: ["cstyle", "C"], cpp: ["cstyle", "C++"], "c++": ["cstyle", "C++"],
    cs: ["cstyle", "C#"], csharp: ["cstyle", "C#"], java: ["cstyle", "Java"],
    go: ["cstyle", "Go"], rust: ["cstyle", "Rust"], php: ["cstyle", "PHP"],
    rb: ["python", "Ruby"], ruby: ["python", "Ruby"], r: ["python", "R"]
  };
  if (!raw) return { key: "", label: "Code" };
  if (aliases[raw]) return { key: aliases[raw][0], label: aliases[raw][1] };
  return { key: raw, label: raw_language.trim() || "Code" };
}

function maybePrettyPrintJSON(code, language_key) {
  var text = String(code || "");
  var trimmed = text.trim();
  var looks_like_json = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (language_key !== "json" && !looks_like_json) {
    return { code: text, languageKey: language_key, languageLabel: null, validJSON: false };
  }
  try {
    var parsed = JSON.parse(trimmed);
    return { code: JSON.stringify(parsed, null, 2), languageKey: "json", languageLabel: "JSON", validJSON: true };
  } catch (error) {
    return { code: text, languageKey: language_key, languageLabel: null, validJSON: false };
  }
}

function codeHighlightRules(language_key) {
  if (language_key === "json") {
    return /(\"(?:\\.|[^\"\\])*\")|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b(?:true|false|null)\b)/g;
  }
  if (language_key === "javascript" || language_key === "typescript" || language_key === "cstyle") {
    return /((?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))|((?:\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`))|(\b(?:async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|let|new|null|of|return|static|super|switch|this|throw|true|try|typeof|undefined|var|void|while|with|yield|interface|implements|package|private|protected|public|enum)\b)|(\b\d+(?:\.\d+)?\b)/g;
  }
  if (language_key === "python") {
    return /((?:#[^\n]*))|((?:\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'))|(\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield)\b)|(\b\d+(?:\.\d+)?\b)/g;
  }
  if (language_key === "css") {
    return /(\/\*[\s\S]*?\*\/)|((?:\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'))|([.#]?[a-zA-Z_-][\w-]*(?=\s*\{)|[a-zA-Z-]+(?=\s*:))|(-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg)?\b)/g;
  }
  if (language_key === "bash") {
    return /((?:#[^\n]*))|((?:\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'))|(\b(?:case|do|done|elif|else|esac|fi|for|function|if|in|select|then|time|until|while)\b)|(\$\{?\w+\}?|\b\d+(?:\.\d+)?\b)/g;
  }
  if (language_key === "sql") {
    return /((?:--[^\n]*|\/\*[\s\S]*?\*\/))|((?:'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"))|(\b(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|VIEW|AS|AND|OR|NOT|NULL|IS|IN|EXISTS|CASE|WHEN|THEN|ELSE|END|DISTINCT|UNION|ALL)\b)|(\b\d+(?:\.\d+)?\b)/gi;
  }
  if (language_key === "html") {
    return /(<!--[\s\S]*?-->)|((?:\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'))|(<\/?[a-zA-Z][^>]*>)|(\b\d+(?:\.\d+)?\b)/g;
  }
  return null;
}

function highlightedCodeHTML(code, language_key) {
  var source = String(code || "");
  var regex = codeHighlightRules(language_key);
  if (!regex) return accountForHTML(source);

  var output = "";
  var cursor = 0;
  var match;
  while ((match = regex.exec(source)) !== null) {
    output += accountForHTML(source.slice(cursor, match.index));
    var cls = "code-token-number";
    if (match[1] !== undefined) cls = "code-token-comment";
    else if (match[2] !== undefined) cls = "code-token-string";
    else if (match[3] !== undefined) cls = "code-token-keyword";
    output += "<span class='" + cls + "'>" + accountForHTML(match[0]) + "</span>";
    cursor = match.index + match[0].length;
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  output += accountForHTML(source.slice(cursor));
  return output;
}

function parseMixedLLMContent(text) {
  var source = String(text || "");
  var segments = [];
  // Markdown-style fenced blocks. Supporting backticks and tildes keeps the
  // parser useful without depending on a full Markdown library.
  var fence_re = /^(`{3,}|~{3,})[ \t]*([^\r\n]*)\r?\n([\s\S]*?)^\1[ \t]*$/gm;
  var cursor = 0;
  var match;
  while ((match = fence_re.exec(source)) !== null) {
    if (match.index > cursor) {
      segments.push({ type: "text", text: source.slice(cursor, match.index) });
    }
    var language = normalizeCodeLanguage(match[2]);
    var pretty = maybePrettyPrintJSON(match[3].replace(/\r\n/g, "\n"), language.key);
    if (pretty.languageLabel) {
      language = { key: pretty.languageKey, label: pretty.languageLabel };
    }
    segments.push({ type: "code", code: pretty.code, languageKey: language.key, languageLabel: language.label });
    cursor = fence_re.lastIndex;
  }
  if (cursor < source.length) {
    segments.push({ type: "text", text: source.slice(cursor) });
  }

  if (!segments.length) segments.push({ type: "text", text: source });

  // If the whole response is valid JSON and wasn't fenced, give it the same
  // readable code-card treatment automatically.
  if (segments.length === 1 && segments[0].type === "text") {
    var whole_json = maybePrettyPrintJSON(segments[0].text, "");
    if (whole_json.validJSON) {
      segments = [{ type: "code", code: whole_json.code, languageKey: "json", languageLabel: "JSON" }];
    }
  }
  return segments;
}

function safeMarkdownLinkTarget(raw) {
  var value = String(raw || '').trim();
  if (!value) return '';
  if (value.charAt(0) === '#') return value;
  try {
    var parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') return value;
  } catch (error) {}
  return '';
}

function appendMarkdownText(container, text) {
  var parts = String(text || '').split('\n');
  parts.forEach(function(part, index) {
    if (index > 0) container.appendChild(document.createElement('br'));
    if (part) container.appendChild(document.createTextNode(part));
  });
}

function appendInlineMarkdown(container, text) {
  var source = String(text || '');
  var tokenRe = /(`([^`\n]+)`)|(\[([^\]\n]+)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\))|(\*\*([^*\n]+)\*\*)|((?<![A-Za-z0-9])__([^_\n]+)__(?![A-Za-z0-9]))|(~~([^~\n]+)~~)|(\*([^*\n]+)\*)|((?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9]))/g;
  var cursor = 0;
  var match;

  while ((match = tokenRe.exec(source)) !== null) {
    if (match.index > cursor) appendMarkdownText(container, source.slice(cursor, match.index));

    if (match[1]) {
      var code = document.createElement('code');
      code.className = 'inline-code';
      code.textContent = match[2];
      container.appendChild(code);
    } else if (match[3]) {
      var href = safeMarkdownLinkTarget(match[5]);
      if (href) {
        var link = document.createElement('a');
        link.href = href;
        if (match[6]) link.title = match[6];
        if (href.charAt(0) !== '#') {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
        appendInlineMarkdown(link, match[4]);
        container.appendChild(link);
      } else {
        container.appendChild(document.createTextNode(match[4]));
      }
    } else if (match[7] || match[9]) {
      var strong = document.createElement('strong');
      appendInlineMarkdown(strong, match[8] || match[10]);
      container.appendChild(strong);
    } else if (match[11]) {
      var del = document.createElement('del');
      appendInlineMarkdown(del, match[12]);
      container.appendChild(del);
    } else {
      var em = document.createElement('em');
      appendInlineMarkdown(em, match[14] || match[16]);
      container.appendChild(em);
    }
    cursor = tokenRe.lastIndex;
  }

  if (cursor < source.length) appendMarkdownText(container, source.slice(cursor));
}

function markdownLineStartsBlock(line) {
  return /^(?:\s{0,3}#{1,6}\s+|\s{0,3}>|\s{0,3}[-+*]\s+|\s{0,3}\d+[.)]\s+|\s{0,3}(?:-{3,}|_{3,}|\*{3,})\s*$)/.test(String(line || ''));
}

function renderMarkdownBlocks(container, text) {
  var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  var i = 0;

  function appendList(ordered) {
    var list = document.createElement(ordered ? 'ol' : 'ul');
    while (i < lines.length) {
      var pattern = ordered ? /^\s{0,3}(\d+)[.)]\s+(.+)$/ : /^\s{0,3}[-+*]\s+(.+)$/;
      var itemMatch = lines[i].match(pattern);
      if (!itemMatch) break;
      if (ordered && list.children.length === 0) {
        var start = parseInt(itemMatch[1], 10);
        if (Number.isFinite(start) && start !== 1) list.start = start;
      }
      var li = document.createElement('li');
      appendInlineMarkdown(li, ordered ? itemMatch[2] : itemMatch[1]);
      list.appendChild(li);
      i += 1;
    }
    container.appendChild(list);
  }

  while (i < lines.length) {
    var line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    var heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      var headingNode = document.createElement('h' + heading[1].length);
      appendInlineMarkdown(headingNode, heading[2]);
      container.appendChild(headingNode);
      i += 1;
      continue;
    }

    if (/^\s{0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      container.appendChild(document.createElement('hr'));
      i += 1;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      var quoteLines = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i += 1;
      }
      var quote = document.createElement('blockquote');
      renderMarkdownBlocks(quote, quoteLines.join('\n'));
      container.appendChild(quote);
      continue;
    }

    if (/^\s{0,3}[-+*]\s+/.test(line)) { appendList(false); continue; }
    if (/^\s{0,3}\d+[.)]\s+/.test(line)) { appendList(true); continue; }

    var paragraphLines = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() && !markdownLineStartsBlock(lines[i])) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
    var paragraph = document.createElement('p');
    // Preserve single source newlines as visible line breaks. This keeps poems,
    // addresses, and other deliberately line-broken output intact while still
    // treating blank lines as paragraph separators.
    appendInlineMarkdown(paragraph, paragraphLines.join('\n'));
    container.appendChild(paragraph);
  }
}

function buildCodeCard(code, language_key, language_label) {
  var card = document.createElement("section");
  card.className = "code-card";

  var header = document.createElement("div");
  header.className = "code-card-header";
  var label = document.createElement("span");
  label.className = "code-language";
  label.textContent = language_label || "Code";
  header.appendChild(label);

  var controls = document.createElement("div");
  controls.className = "code-card-controls";
  [["copy", "Copy"], ["wrap", "Wrap"], ["expand", "Expand"]].forEach(function(spec) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "code-card-button";
    button.dataset.codeAction = spec[0];
    button.textContent = spec[1];
    button.setAttribute("aria-label", spec[1] + " " + (language_label || "code") + " block");
    if (spec[0] === "wrap") button.setAttribute("aria-pressed", "false");
    if (spec[0] === "expand") button.setAttribute("aria-expanded", "false");
    controls.appendChild(button);
  });
  header.appendChild(controls);
  card.appendChild(header);

  var screen_reader_label = document.createElement("span");
  screen_reader_label.className = "sr-only";
  screen_reader_label.textContent = "Code block, " + (language_label || "code") + ": ";
  card.appendChild(screen_reader_label);

  var body = document.createElement("div");
  body.className = "code-card-body";
  var pre = document.createElement("pre");
  pre.className = "code-pre";
  var code_element = document.createElement("code");
  code_element.className = "code-block" + (language_key ? " language-" + language_key : "");
  code_element.innerHTML = highlightedCodeHTML(code, language_key);
  pre.appendChild(code_element);
  body.appendChild(pre);
  card.appendChild(body);
  return card;
}

function renderLLMOutput(text) {
  var output = document.createElement("div");
  output.className = "output_text rich-output";
  var speaker = document.createElement("span");
  speaker.className = "sr-only";
  speaker.textContent = "bot: ";
  output.appendChild(speaker);

  parseMixedLLMContent(text).forEach(function(segment) {
    if (segment.type === "code") {
      output.appendChild(buildCodeCard(segment.code, segment.languageKey, segment.languageLabel));
      return;
    }
    if (!segment.text) return;
    var prose = document.createElement("div");
    prose.className = "output-prose markdown-body";
    renderMarkdownBlocks(prose, segment.text);
    output.appendChild(prose);
  });
  return output;
}

function appendLLMOutputBubble(text) {
  bubble += 1;
  var wrap = document.createElement("div");
  wrap.className = "text_wrap";
  wrap.id = "text_" + bubble;
  wrap.appendChild(renderLLMOutput(text));
  document.getElementById("output_window").appendChild(wrap);
  scroll2Q(wrap.id);
}

function installCodeCardControls(doc) {
  if (!doc || doc.__litCodeControlsInstalled) return;
  doc.__litCodeControlsInstalled = true;

  function fallbackCopy(text) {
    var textarea = doc.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    doc.body.appendChild(textarea);
    textarea.select();
    try { doc.execCommand("copy"); } catch (error) {}
    textarea.remove();
  }

  function copyText(text) {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function() { fallbackCopy(text); });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }

  function lockViewportForExpandedCode() {
    if (!doc.documentElement || !doc.body || doc.__litCodeModalViewportLock) return;
    var view = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    var root = doc.documentElement;
    var body = doc.body;
    var width = Math.max(root.clientWidth || 0, view && view.innerWidth ? view.innerWidth : 0);
    var height = Math.max(root.clientHeight || 0, view && view.innerHeight ? view.innerHeight : 0);
    if (!width || !height) return;

    doc.__litCodeModalViewportLock = {
      rootWidth: root.style.width,
      rootHeight: root.style.height,
      rootMinWidth: root.style.minWidth,
      rootMinHeight: root.style.minHeight,
      bodyWidth: body.style.width,
      bodyHeight: body.style.height,
      bodyMinWidth: body.style.minWidth,
      bodyMinHeight: body.style.minHeight
    };

    // Extension popups are intrinsically sized from their document. A fixed
    // code card leaves normal flow and can otherwise make the browser shrink
    // the popup underneath it. Pin the current viewport while the modal is
    // open; ordinary standalone pages simply keep their current viewport.
    root.style.width = width + 'px';
    root.style.height = height + 'px';
    root.style.minWidth = width + 'px';
    root.style.minHeight = height + 'px';
    body.style.width = width + 'px';
    body.style.height = height + 'px';
    body.style.minWidth = width + 'px';
    body.style.minHeight = height + 'px';
  }

  function unlockViewportAfterExpandedCode() {
    var saved = doc.__litCodeModalViewportLock;
    if (!saved || !doc.documentElement || !doc.body) return;
    var root = doc.documentElement;
    var body = doc.body;
    root.style.width = saved.rootWidth;
    root.style.height = saved.rootHeight;
    root.style.minWidth = saved.rootMinWidth;
    root.style.minHeight = saved.rootMinHeight;
    body.style.width = saved.bodyWidth;
    body.style.height = saved.bodyHeight;
    body.style.minWidth = saved.bodyMinWidth;
    body.style.minHeight = saved.bodyMinHeight;
    doc.__litCodeModalViewportLock = null;
  }

  function collapseCard(card) {
    if (!card) return;
    card.classList.remove("is-expanded");
    var expand = card.querySelector("[data-code-action='expand']");
    if (expand) {
      expand.textContent = "Expand";
      expand.setAttribute("aria-expanded", "false");
    }
    if (!doc.querySelector(".code-card.is-expanded")) {
      doc.body.classList.remove("code-modal-open");
      unlockViewportAfterExpandedCode();
    }
  }

  doc.addEventListener("click", function(event) {
    var button = event.target.closest ? event.target.closest("[data-code-action]") : null;
    if (!button) return;
    var card = button.closest(".code-card");
    if (!card) return;
    var action = button.dataset.codeAction;

    if (action === "copy") {
      var code = card.querySelector(".code-block");
      copyText(code ? code.textContent : "").then(function() {
        var original = button.textContent;
        button.textContent = "Copied";
        setTimeout(function() { button.textContent = original === "Copied" ? "Copy" : original; }, 1200);
      });
    } else if (action === "wrap") {
      var wrapped = card.classList.toggle("is-wrapped");
      button.textContent = wrapped ? "Don't wrap" : "Wrap";
      button.setAttribute("aria-pressed", wrapped ? "true" : "false");
    } else if (action === "expand") {
      var expanding = !card.classList.contains("is-expanded");
      Array.prototype.forEach.call(doc.querySelectorAll(".code-card.is-expanded"), function(other) {
        if (other !== card) collapseCard(other);
      });
      if (expanding) {
        lockViewportForExpandedCode();
        card.classList.add("is-expanded");
        doc.body.classList.add("code-modal-open");
        button.textContent = "Collapse";
        button.setAttribute("aria-expanded", "true");
      } else {
        collapseCard(card);
      }
    }
  });

  doc.addEventListener("keydown", function(event) {
    if (event.key !== "Escape") return;
    var card = doc.querySelector(".code-card.is-expanded");
    if (!card) return;
    var button = card.querySelector("[data-code-action='expand']");
    collapseCard(card);
    if (button) button.focus();
  });
}

function transcriptCodeControlsScript() {
  return "<script>(" + installCodeCardControls.toString() + ")(document);</scr" + "ipt>";
}

function composerTerminalControlIsVisible(){
  return ['text_input', 'chat_text_input'].some(function(id) {
    var element = document.getElementById(id);
    return element && element.style.display !== 'none' && element.style.display !== '';
  });
}

function suppressStandaloneTerminalForComposer(){
  var restart = document.getElementById('restartButton');
  if (restart && composerTerminalControlIsVisible()) {
    restart.style.display = 'none';
  }
}

function insert_restart(){
  var restart = document.getElementById('restartButton');
  var transcript_actions = document.querySelector('.transcript-actions');
  if (!restart) return;

  // A visible text/chat composer already contains its own SEND + Back Home/CLOSE
  // controls. Never show the standalone one-line terminal control at the same
  // time, otherwise flows such as Continue Generation -> CHAT can display two
  // Back Home/CLOSE buttons.
  if (composerTerminalControlIsVisible()) {
    restart.style.display = 'none';
    return;
  }

  // The terminal/recovery control is Back Home in the toolbar popup and CLOSE
  // in a persistent interaction tab. Keep it immediately above SAVE TRANSCRIPT
  // / LOGS no matter which path made it visible. This also protects restored
  // sessions and future terminal paths from DOM-order drift.
  restart.textContent = interaction_tab_mode ? 'CLOSE' : 'Back Home';
  restart.setAttribute('aria-label', interaction_tab_mode ? 'Close interaction tab' : 'Back Home');
  if (transcript_actions && restart.nextElementSibling !== transcript_actions) {
    transcript_actions.parentNode.insertBefore(restart, transcript_actions);
  }

  restart.style.display='block';
  restart.focus(); 
}

function after_build(LLM_text,finish_reason="stop",explicit_passThrough=null,use_explicit_passThrough=false) {
  
  last_finish_reason = finish_reason;
  // BEGIN EXTENSION-ONLY LOGGING
  debugRecordOutput(LLM_text, finish_reason);
  // END EXTENSION-ONLY LOGGING
  // BEGIN EXTENSION-ONLY LOGGING
  debugRecordOutputHandling(output_to);
  // END EXTENSION-ONLY LOGGING
  if ((overflow==1) && (behavior=="chat")) {
    LLM_text_collection += LLM_text;
  } else {
    LLM_text_collection = LLM_text;
  }

  // Render LLM output as mixed prose/code content. This supports multiple
  // alternating prose and fenced-code segments in a single response.
  document.getElementById('thinking_box').style.display='none';
  set_generation_active(false);

  // If not hidden
  if (output_to<4) {
    appendLLMOutputBubble(LLM_text);
  }

  // Determine the value handed to the next template. JavaScript templates can
  // provide a structured value directly instead of round-tripping through text.
  if (use_explicit_passThrough) {
    passThrough = explicit_passThrough;
  } else if (json_mode>=1) {
    console.log("Attempting to parse JSON...")
    try {
      passThrough = JSON.parse(LLM_text_collection.trim());
      LLM_text_collection = JSON.stringify(passThrough, null, 2);        
    } catch (error) {
      alert("Warning: Output isn't JSON. Leaving as is! This may cause issues.")
      passThrough = LLM_text_collection;     
    }
  } else {
    passThrough = LLM_text_collection;
  }

  var output_words = count_words(LLM_text_collection);
  var output_characters = String(LLM_text_collection || "").length;
  var output_stats = " (~"+output_words.toLocaleString()+" words / ~"+output_characters.toLocaleString()+" characters)";

  // Output location
  if (output_to==1) {
    appendStatusMessage('above output copied to clipboard' + output_stats);
    copy_to_clipboard(LLM_text_collection);
  } else if (output_to==2) {
    //FOR EXPORT: document.getElementById('scratch_pad').value += LLM_text_collection;
    appendStatusMessage('above output appended to scratch pad' + output_stats);
    setScratchText(getScratchText() + LLM_text); // used LLM_text, not LLM_text_collection because will have already been appended
  } else if (output_to==3) {
    //FOR EXPORT: document.getElementById('scratch_pad').value = LLM_text_collection;
    appendStatusMessage('above output replaced scratch pad' + output_stats);
    setScratchText(LLM_text_collection);
  } else if (output_to==5) {
    //document.getElementById('output_window').innerHTML += "<div class='msg_text'>above output copied to clipboard</div>";
    copy_to_clipboard(LLM_text_collection);
  } else if (output_to==6) {
    //FOR EXPORT: document.getElementById('scratch_pad').value += LLM_text_collection;
    //appendStatusMessage('above output appended to scratch pad' + output_stats);
    setScratchText(getScratchText() + LLM_text); // used LLM_text, not LLM_text_collection because will have already been appended
  } else if (output_to==7) {
    //FOR EXPORT: document.getElementById('scratch_pad').value = LLM_text_collection;
    //appendStatusMessage('above output replaced scratch pad' + output_stats);
    setScratchText(LLM_text_collection);
  } 
  
  // Behavior

  overflow=0;

  if ((finish_reason=="length") && (behavior=="chat")){
    // BEGIN EXTENSION-ONLY LOGGING
    debugRecordPostRun(behavior, 'CONTINUE GENERATION', 'Provider stopped because the output token limit was reached.');
    // END EXTENSION-ONLY LOGGING
    overflow=1;
    document.getElementById('continue_gen').style.display='block';
    insert_restart();
    calls=0;
    scroll2Q("text_"+bubble); 
    save_popup_output();

  } else if (behavior=="stop") {
    // BEGIN EXTENSION-ONLY LOGGING
    debugRecordPostRun(behavior, 'FULL STOP');
    // END EXTENSION-ONLY LOGGING
    // End
    //document.getElementById('output_window').innerHTML += "<div class='msg_text'>end</div>";
    calls=0;
    insert_restart();
    scroll2Q("text_"+bubble); 
    save_popup_output();

  } else if (behavior=="chat") {
    // BEGIN EXTENSION-ONLY LOGGING
    debugRecordPostRun(behavior, 'CHAT');
    // END EXTENSION-ONLY LOGGING
    // Continue chat
    //document.getElementById('output_window').innerHTML += "<div class='msg_text'>engage with the above</div>";
    document.getElementById('chat_text_input').style.display='block';
    suppressStandaloneTerminalForComposer();
    document.getElementById('chat_user_input').focus();
    calls=0;
    scroll2Q("text_"+bubble); 
    save_popup_output();

  } else if (behavior=="close") {
    // BEGIN EXTENSION-ONLY LOGGING
    debugRecordPostRun(behavior, (typeof LitPlatform !== 'undefined' && LitPlatform.isExtensionContext()) ? (interaction_tab_mode ? 'CLOSE INTERACTION TAB' : 'CLOSE POP-UP') : 'BACK HOME', 'Clears the current run before closing or returning Home.');
    // END EXTENSION-ONLY LOGGING
    // In the extension, reset state and close the popup. In standalone exports,
    // reset state and return to Home without closing the page.
    calls=0;
    clear_and_close_popup();

  } else if (behavior=="file") {
    // BEGIN EXTENSION-ONLY LOGGING
    debugRecordPostRun(behavior, (typeof LitPlatform !== 'undefined' && LitPlatform.isExtensionContext()) ? (interaction_tab_mode ? 'SAVE TO FILE → CLOSE INTERACTION TAB' : 'SAVE TO FILE → CLOSE POP-UP') : 'SAVE TO FILE → BACK HOME', 'Downloads the final output, then clears the current run.');
    // END EXTENSION-ONLY LOGGING
    // Save the final output, then clear the persisted run. In the extension this
    // closes the popup; standalone exports return Home and keep the page open.
    // Delay the final navigation/close slightly so the download is committed.
    appendStatusMessage('triggered save to file');
    calls=0;
    saveTextAsFile(
      LLM_text_collection,
      timestampedDownloadFilename("output_", "txt", new Date())
    );
    clear_and_close_popup(100);

  } else if (behavior=="pass") {
    // passThrough
    if (passThrough != null && (typeof passThrough === "object" || typeof passThrough === "string") && passThrough["next"]){
      try {
        // BEGIN EXTENSION-ONLY LOGGING
        debugRecordPostRun(behavior, 'DYNAMIC → ' + passThrough["next"], 'Destination read from passThrough["next"].');
        // END EXTENSION-ONLY LOGGING
        choose_prompt(passThrough["next"])        
      } catch (error) {
        // BEGIN EXTENSION-ONLY LOGGING
        debugRecordPostRun(behavior, 'FULL STOP', 'DYNAMIC target was not found: ' + passThrough["next"]);
        // END EXTENSION-ONLY LOGGING
        alert('No matching prompt found for "'+passThrough["next"]+'." Defaulting to FULL STOP')
        //document.getElementById('output_window').innerHTML += "<div class='msg_text'>end</div>";          
        calls=0;
        insert_restart();
        scroll2Q("text_"+bubble); 
      }
    } else {
      // BEGIN EXTENSION-ONLY LOGGING
      debugRecordPostRun(behavior, 'FULL STOP', 'No passThrough["next"] value was available.');
      // END EXTENSION-ONLY LOGGING
      alert('No value found for passThrough["next"] defaulting to FULL STOP')
      //document.getElementById('output_window').innerHTML += "<div class='msg_text'>end</div>";
      calls=0;
      insert_restart();
      scroll2Q("text_"+bubble); 
    }

  } else {
    // Run another prompt
    // BEGIN EXTENSION-ONLY LOGGING
    debugRecordPostRun(behavior, 'CHAIN → ' + behavior, 'Runs the named template next.');
    // END EXTENSION-ONLY LOGGING
    choose_prompt(behavior)

  }

}
