const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'options.js'), 'utf8');

function extractFunction(name, nextName) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Missing function ' + name);
  const end = nextName ? source.indexOf('function ' + nextName + '(', start + 1) : -1;
  if (nextName && end < 0) throw new Error('Missing next function ' + nextName);
  return source.slice(start, end < 0 ? source.length : end);
}

const mergeCode =
  extractFunction('nextAvailablePromptName', 'normalizeImportedPromptTemplate') + '\n' +
  extractFunction('normalizeImportedPromptTemplate', 'mergePromptObjects') + '\n' +
  extractFunction('mergePromptObjects', 'mergePromptsFromJson');
const mergeContext = {};
vm.createContext(mergeContext);
vm.runInContext(mergeCode, mergeContext);

const existing = {
  Summarize: { prompt: 'existing' },
  Keep: { prompt: 'keep' }
};
const incoming = {
  Summarize: { prompt: 'imported', behavior: 'Next' },
  'Summarize 2': { prompt: 'already numbered', behavior: 'Summarize' },
  Next: { prompt: 'next', behavior: 'Summarize' }
};
const result = mergeContext.mergePromptObjects(existing, incoming);
assert.deepStrictEqual(JSON.parse(JSON.stringify(result.renamed)), [{ from: 'Summarize', to: 'Summarize 3' }]);
assert.deepStrictEqual(Object.keys(result.templates), ['Summarize', 'Keep', 'Summarize 3', 'Summarize 2', 'Next']);
assert.strictEqual(result.templates['Summarize 2'].behavior, 'Summarize 3');
assert.strictEqual(result.templates.Next.behavior, 'Summarize 3');
assert.strictEqual(result.templates.Summarize.prompt, 'existing');

const existing2 = {
  Summarize: { prompt: 'one' },
  'Summarize 2': { prompt: 'two' }
};
const incoming2 = { Summarize: { prompt: 'three', behavior: 'Summarize' } };
const result2 = mergeContext.mergePromptObjects(existing2, incoming2);
assert.strictEqual(result2.importedNameMap.Summarize, 'Summarize 3');
assert.strictEqual(result2.templates['Summarize 3'].behavior, 'Summarize 3');

// Test the filter haystack without loading the full Settings page.
const filterCode =
  `function promptField(promptListing, fieldName) { return promptListing ? promptListing.querySelector('[data-field="' + fieldName + '"]') : null; }\n` +
  extractFunction('promptFilterHaystack', 'applyPromptFilter');
const filterContext = {};
vm.createContext(filterContext);
vm.runInContext(filterCode, filterContext);
function listing(values) {
  return {
    querySelector(selector) {
      const match = selector.match(/data-field="([^"]+)"/);
      const key = match && match[1];
      return Object.prototype.hasOwnProperty.call(values, key) ? { value: values[key] } : null;
    }
  };
}
const haystack = filterContext.promptFilterHaystack(listing({
  prompt_name: 'Case Summary',
  prompt: 'Explain the highlighted passage',
  model: 'gpt-5',
  endpoint: 'https://api.openai.com/v1/responses'
}));
assert(haystack.includes('case summary'));
assert(haystack.includes('highlighted passage'));
assert(haystack.includes('gpt-5'));
assert(haystack.includes('/responses'));

assert(source.includes("document.getElementById('prompt_filter')"));
assert(source.includes('mergePromptsFromJson(json)'));
assert(!source.includes('This will replace your current prompts with those in the file you upload.'));

// Blank/omitted imported endpoint and model values must remain blank. Defaults are
// execution-time inheritance only; import must never pin prompts to this browser's
// current defaults.
const blankInheritance = mergeContext.mergePromptObjects({}, {
  'Blank explicit': { prompt: 'one', endpoint: '', model: '' },
  'Blank whitespace': { prompt: 'two', endpoint: '   ', model: '   ' },
  'Missing fields': { prompt: 'three' },
  'Explicit model': { prompt: 'four', endpoint: ' https://example.test/v1/chat/completions ', model: ' custom-model ' }
});
assert.strictEqual(blankInheritance.templates['Blank explicit'].model, '');
assert.strictEqual(blankInheritance.templates['Blank explicit'].endpoint, '');
assert.strictEqual(blankInheritance.templates['Blank whitespace'].model, '');
assert.strictEqual(blankInheritance.templates['Blank whitespace'].endpoint, '');
assert.strictEqual(blankInheritance.templates['Missing fields'].model, '');
assert.strictEqual(blankInheritance.templates['Missing fields'].endpoint, '');
assert.strictEqual(blankInheritance.templates['Explicit model'].model, 'custom-model');
assert.strictEqual(blankInheritance.templates['Explicit model'].endpoint, 'https://example.test/v1/chat/completions');
assert(source.includes("template.model || ''"), 'Editor should render an inherited model as a blank input');
assert(source.includes("const model = promptListing.querySelector('[data-field=\"model\"]').value;"), 'Saving should persist the literal Model input value, not the effective default');

console.log('Prompt merge/filter regression tests passed.');
