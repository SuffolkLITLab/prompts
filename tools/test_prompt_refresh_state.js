const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'options.js'), 'utf8');

function extractFunction(name, nextName) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Missing function ' + name);
  const end = nextName ? source.indexOf('function ' + nextName + '(', start + 1) : -1;
  if (nextName && end < 0) throw new Error('Missing next function ' + nextName);
  return source.slice(start, end < 0 ? source.length : end);
}

// Verify JSON Schema visibility responds to both JSON value and actual availability.
const elements = {};
const context = {
  document: {
    getElementById(id) { return elements[id] || null; }
  }
};
vm.createContext(context);
vm.runInContext(extractFunction('updateJsonSchemaVisibility', 'createJsonSchemaInput'), context);

function makePrompt({ output = '1', json = '1', jsonDisabled = false } = {}) {
  const schema = { style: { display: '' } };
  const outputSelect = { value: output };
  const jsonSelect = { value: json, disabled: jsonDisabled };
  const listing = {
    querySelector(selector) {
      if (selector === '[data-field="json_mode"]') return jsonSelect;
      if (selector === '.json-schema-parameter') return schema;
      if (selector === '[data-field="output"]') return outputSelect;
      return null;
    }
  };
  elements.prompt_test = listing;
  context.updateJsonSchemaVisibility('prompt_test');
  return schema.style.display;
}

assert.strictEqual(makePrompt({ output: '1', json: '1', jsonDisabled: false }), 'block');
assert.strictEqual(makePrompt({ output: '1', json: '0', jsonDisabled: false }), 'none');
assert.strictEqual(makePrompt({ output: '0', json: '1', jsonDisabled: false }), 'none');
assert.strictEqual(makePrompt({ output: '1', json: '1', jsonDisabled: true }), 'none');

// Controls now have unique ids, so refresh logic must use data-field rather than legacy ids.
assert(!source.includes("event.target.id === 'json_mode'"));
assert(!source.includes("event.target.id === 'output'"));
assert(source.includes("field === 'json_mode'"));
assert(source.includes("field === 'output'"));
assert(source.includes("field === 'reasoning_effort'"));
assert(source.includes("field === 'endpoint' || field === 'model'"));
assert(source.includes("requestJavaScriptPermission();"));
assert(source.includes("field === 'prompt_name' || field === 'prompt' || field === 'model' || field === 'endpoint'"));
assert(source.includes('const jsonAvailable = isLlmType && !jsonModeSelect.disabled;'));
assert(source.includes('updateJsonSchemaVisibility(promptId);'));

console.log('Prompt refresh-state regression tests passed.');
