const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const prompts = fs.readFileSync(path.join(root, 'js/prompts.js'), 'utf8');
const options = fs.readFileSync(path.join(root, 'js/options.js'), 'utf8');

function assert(cond, msg) { if (!cond) throw new Error(msg); }

assert(prompts.includes('function stop_prompt_before_execution()'), 'missing terminal prompt abort helper');
assert(prompts.includes('if (abandon_prompt != 0) {\n      stop_prompt_before_execution();'), 'abandoned prompt does not enter recoverable terminal state');
assert(/function stop_prompt_before_execution\(\)[\s\S]*if \(!run_has_committed_step\)[\s\S]*clear_popup_output\(\);[\s\S]*location\.reload\(\);[\s\S]*insert_restart\(\);[\s\S]*save_popup_output\(\);/.test(prompts), 'initial abort must return Home while later aborts remain recoverable');
assert(prompts.includes('run_has_committed_step: run_has_committed_step'), 'committed-run state is not persisted');
assert(prompts.includes('run_has_committed_step = true;\n  console.log("Building prompt...")'), 'successful prompt preprocessing does not commit the run');
assert(options.includes("model: '',\n        temperature: '',\n        max_tokens: '',"), 'new-template model/max token defaults should be blank');
assert(options.includes("input.placeholder = 'Blank = default model';"), 'model inheritance placeholder missing');
assert(!/function addNewPrompt\(\)[\s\S]{0,900}max_tokens:\s*250/.test(options), 'new templates still default max_tokens to 250');
console.log('terminal abort/defaults regression checks passed');
