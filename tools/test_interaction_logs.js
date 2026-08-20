#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const promptSource = fs.readFileSync(path.join(ROOT, 'js', 'prompts.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8');

assert(popupHtml.includes('id="save_transcript"'), 'SAVE TRANSCRIPT link missing');
assert(popupHtml.includes('id="logs_toggle"'), 'LOGS link missing');
assert(popupHtml.includes('class="transcript-control-link">SAVE TRANSCRIPT</a>'), 'SAVE TRANSCRIPT and LOGS should use shared link styling');
assert(popupHtml.includes('id="transcript_action_separator"') && popupHtml.includes('&middot;'), 'Transcript action dot separator missing');
assert(promptSource.includes("handoffLabel.textContent = 'HANDOFF: '"), 'Prompt handoff banner rendering missing');
assert(promptSource.includes("entry.postRun.handoff ="), 'Structured prompt handoff logging missing');
assert(promptSource.includes("details.className = 'debug-log-entry debug-log-topline'"), 'Prompt interactions should render as top-level expandable headers');
assert(promptSource.includes("callDetails.className = 'debug-log-api-call debug-log-topline'"), 'API interactions should render as top-level expandable headers');
assert(promptSource.includes('container.appendChild(callDetails);'), 'API interactions should be appended at the log top level');
assert(!promptSource.includes('details.appendChild(callDetails);'), 'API interactions should not be nested inside prompt disclosures');
assert(promptSource.includes("return 'CHAT TURN ' + (callIndex + 1);"), 'Chat API turns should be labeled in top-line headers');
assert(promptSource.includes("return 'CONTINUE GENERATION';"), 'Continue-generation API interactions should be labeled');
assert(promptSource.includes("return 'RETRY';"), 'Retry API interactions should be labeled');
assert(popupHtml.indexOf('id="logs_toggle"') > popupHtml.indexOf('id="save_transcript"'), 'LOGS should be next to/after SAVE TRANSCRIPT');
assert(popupHtml.includes('id="debug_log_card"') && popupHtml.includes('hidden'), 'Debug log card must default hidden');
assert(promptSource.includes('debugLogExportHTML()'), 'Saved transcripts must include logs');
assert(promptSource.includes('transcriptDebugLogScript()'), 'Saved transcripts must include LOGS toggle behavior');
assert(promptSource.includes("debugRecordPostRun(behavior, 'FULL STOP')"), 'FULL STOP behavior should be logged');
assert(promptSource.includes("'SAVE TO FILE → CLOSE POP-UP'"), 'SAVE TO FILE behavior should be logged');
assert(promptSource.includes("'DYNAMIC → '"), 'DYNAMIC behavior should be logged');
assert(promptSource.includes('debug_log_entries: compactDebugLogForPersistence'), 'Logs should persist with session state');
assert(promptSource.includes('debug_log_entries = [];'), 'Logs should clear with run state');

// Exercise the API-call logger in isolation and verify credential/header redaction.
const start = promptSource.indexOf('function redactRequestHeaders(');
const end = promptSource.indexOf('function debugPre(', start);
assert(start >= 0 && end > start, 'Could not extract API logging helpers');
const loggingHelpers = promptSource.slice(start, end);
let entry = { apiCalls: [] };
const context = {
  console,
  Date,
  JSON,
  Object,
  String,
  Number,
  api_base: 'https://api.openai.com/v1/responses',
  model: 'gpt-5',
  temperature: '',
  max_tokens: '',
  reasoning_effort: 'medium',
  verbosity: 'low',
  json_mode: 1,
  json_schema: '{"type":"object"}',
  get_request_timeout_seconds: () => 120,
  debugTimestamp: () => new Date().toISOString(),
  currentDebugEntry: () => entry,
  debugCommit: () => {},
  safeResponseHeader: (xhr, name) => xhr.headers[name] || ''
};
vm.createContext(context);
vm.runInContext(loggingHelpers, context);
const request = {
  protocol: 'openai_responses',
  protocolLabel: 'OpenAI Responses',
  headers: {
    Authorization: 'Bearer sk-super-secret',
    'X-Custom-Header': 'also-secret',
    'Content-Type': 'application/json'
  },
  body: { model: 'gpt-5', input: [{ role: 'user', content: 'hello' }] }
};
const call = context.debugStartApiCall(request, 'hello', true);
assert.strictEqual(call.apiKey, 'configured');
assert.strictEqual(call.headers.Authorization, '[REDACTED]');
assert.strictEqual(call.headers['X-Custom-Header'], '[REDACTED]');
assert.strictEqual(call.headers['Content-Type'], '[REDACTED]');
assert(!JSON.stringify(call).includes('sk-super-secret'), 'API key leaked into log');
assert(!JSON.stringify(call).includes('also-secret'), 'Custom header leaked into log');

const xhr = {
  status: 200,
  statusText: 'OK',
  responseText: JSON.stringify({ output_text: 'hello', usage: { input_tokens: 4, output_tokens: 2 } }),
  headers: { 'x-request-id': 'req_123', 'content-type': 'application/json' }
};
context.debugFinishApiCall(call, xhr, 'success');
assert.strictEqual(call.status, 200);
assert.strictEqual(call.responseHeaders['x-request-id'], 'req_123');
assert.strictEqual(call.usage.input_tokens, 4);
assert(call.elapsedMs >= 0);

console.log('Interaction log regression tests passed.');
