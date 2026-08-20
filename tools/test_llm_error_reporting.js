const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const adapterSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'api_adapters.js'), 'utf8');
const adapterContext = { URL, console };
vm.createContext(adapterContext);
vm.runInContext(adapterSource, adapterContext);
const adapters = adapterContext.LitApiAdapters;

const reasoning = adapters.extractError(JSON.stringify({
  error: {
    message: "Unsupported value: 'max' is not supported with this model. Supported values are: 'low', 'medium', and 'high'.",
    type: 'invalid_request_error',
    param: 'reasoning_effort',
    code: 'unsupported_value'
  },
  request_id: 'req_reasoning_123'
}));
assert.strictEqual(reasoning.code, 'unsupported_value');
assert.strictEqual(reasoning.type, 'invalid_request_error');
assert.strictEqual(reasoning.param, 'reasoning_effort');
assert.strictEqual(reasoning.requestId, 'req_reasoning_123');
assert(reasoning.message.includes('Supported values'));
assert(adapters.getErrorHint(reasoning, { status: 400 }).includes('Reasoning Effort'));

const anthropic = adapters.extractError(JSON.stringify({
  type: 'error',
  error: {
    type: 'authentication_error',
    message: 'invalid x-api-key'
  },
  request_id: 'req_anthropic_123'
}));
assert.strictEqual(anthropic.type, 'authentication_error');
assert.strictEqual(anthropic.requestId, 'req_anthropic_123');
assert(adapters.getErrorHint(anthropic, { status: 401 }).includes('API key'));

const detail = adapters.extractError(JSON.stringify({ detail: 'Model not found' }));
assert.strictEqual(detail.message, 'Model not found');
assert(adapters.getErrorHint(detail, { status: 404 }).includes('Model value'));

const raw = adapters.extractError('  upstream gateway\n  unavailable  ');
assert.strictEqual(raw.rawIsJson, false);
assert.strictEqual(raw.message, 'upstream gateway unavailable');
assert(adapters.getErrorHint(raw, { status: 503 }).includes('server error'));

const promptSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'prompts.js'), 'utf8');
const start = promptSource.indexOf('function safeResponseHeader(');
const end = promptSource.indexOf('async function openai_call(', start);
assert(start >= 0 && end > start, 'Could not extract LLM error formatting helpers');
const formatterSource = promptSource.slice(start, end);
const formatterContext = {
  LitApiAdapters: adapters,
  api_base: 'https://api.openai.com/v1/responses',
  model: 'gpt-test',
  console
};
vm.createContext(formatterContext);
vm.runInContext(formatterSource, formatterContext);
const fakeXhr = {
  status: 400,
  statusText: 'Bad Request',
  getResponseHeader(name) {
    return name.toLowerCase() === 'x-request-id' ? 'req_header_fallback' : '';
  }
};
const formatted = formatterContext.formatLlmApiError(fakeXhr, reasoning, new Error('fallback'));
assert(formatted.includes('HTTP 400 Bad Request'));
assert(formatted.includes('Unsupported value'));
assert(formatted.includes('`unsupported_value`'));
assert(formatted.includes('`reasoning_effort`'));
assert(formatted.includes('`req_reasoning_123`'));
assert(formatted.includes('Reasoning Effort'));

const successXhr = { status: 200, statusText: 'OK', getResponseHeader() { return ''; } };
const malformed = formatterContext.formatLlmApiError(successXhr, { message: 'The API response did not contain choices[0].message.' }, new Error('bad shape'));
assert(malformed.includes('response that LIT Prompting could not use'));
assert(malformed.includes('HTTP 200 OK'));

assert(!promptSource.includes('There was an ERROR calling the LLM. Make sure you are using a valid endpoint'));
console.log('LLM error-reporting regression tests passed.');
