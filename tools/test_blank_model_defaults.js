const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const functions = fs.readFileSync(path.join(root, 'js', 'functions.js'), 'utf8');
const options = fs.readFileSync(path.join(root, 'js', 'options.js'), 'utf8');

const start = functions.indexOf('function default_prompts_for_model(');
const end = functions.indexOf("localStorage.setItem('default_templates'", start);
assert(start >= 0 && end > start, 'default_prompts_for_model factory missing');
const factory = functions.slice(start, end);
assert(!/\.model\s*=\s*modelName/.test(factory), 'default prompt factory still materializes Default Model');
assert(!/!prompts\[name\]\.model/.test(factory), 'blank built-in model is still treated as a value to fill');
assert(factory.includes('JSON.parse(JSON.stringify(default_prompts))'), 'factory should clone authored default prompt records');

assert(options.includes("template.model = (template.model == null || String(template.model).trim() === '')"), 'import normalization must preserve blank models');
assert(options.includes("const model = promptListing.querySelector('[data-field=\"model\"]').value;"), 'save path must persist literal Model input value');
assert(options.includes("document.querySelectorAll('#prompt_list input[data-field=\"model\"]')"), 'Force Default Model bulk action missing');

console.log('blank/default model materialization regression checks passed');
