#!/usr/bin/env node
/* Regression test for standalone export assembly. No external dependencies. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const optionsSource = fs.readFileSync(path.join(ROOT, 'js/options.js'), 'utf8');
const start = optionsSource.indexOf('function replaceExportChunk');
const second = optionsSource.indexOf('function build_export_w_scrtach', start);
if (start < 0 || second < 0) throw new Error('Export builder functions not found.');

function findFunctionEnd(source, functionStart) {
  let index = source.indexOf('{', functionStart);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return index + 1;
  }
  throw new Error('Could not find export builder end.');
}

const end = findFunctionEnd(optionsSource, second);
const builderSource = optionsSource.slice(start, end);
const nastyTemplates = {
  "Replacement $& $` $'": {
    prompt: "before </script><script>evil()</script> after $& $` $'\u2028line",
    model: 'gpt-6', output: 1, behavior: 'stop', hide_button: false
  }
};
const context = {
  console,
  popupHTML: fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8'),
  platformJS: fs.readFileSync(path.join(ROOT, 'js/platform.js'), 'utf8'),
  spinJS: fs.readFileSync(path.join(ROOT, 'js/spin.min.js'), 'utf8'),
  functionsJS: fs.readFileSync(path.join(ROOT, 'js/functions.js'), 'utf8'),
  apiAdaptersJS: fs.readFileSync(path.join(ROOT, 'js/api_adapters.js'), 'utf8'),
  promptsJS: fs.readFileSync(path.join(ROOT, 'js/prompts.js'), 'utf8'),
  popupJS: fs.readFileSync(path.join(ROOT, 'js/popup_exported.js'), 'utf8'),
  popupCSS: fs.readFileSync(path.join(ROOT, 'css/popup_exported.css'), 'utf8'),
  popup_scratchCSS: fs.readFileSync(path.join(ROOT, 'css/popup_scratch.css'), 'utf8'),
  localStorage: { getItem: (key) => key === 'templates' ? JSON.stringify(nastyTemplates) : null },
  get_default_model: () => 'gpt-6</script>$&',
  get_default_api_endpoint: () => 'https://api.openai.com/v1/responses?x=$&',
  apiKeysNeededForCurrentPrompts: () => ({ 'https://api.openai.com/v1/responses?x=$&': 'sk-$&-</script>' }),
  document: { getElementById: () => ({ value: '<p>Header $& $` $\'</p>' }) }
};
vm.createContext(context);
vm.runInContext(builderSource, context);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lit-export-test-'));
try {
  for (const scratch of [false, true]) {
    for (const encrypted of [null, 'QkFTRTY0']) {
      const html = scratch ? context.build_export_w_scrtach(encrypted, 'pw') : context.build_export(encrypted, 'pw');
      const scriptStart = html.indexOf('<script>') + '<script>'.length;
      const scriptEnd = html.indexOf('</script>', scriptStart);
      if (scriptStart < '<script>'.length || scriptEnd < 0) throw new Error('Generated inline script missing.');
      const inlineScript = html.slice(scriptStart, scriptEnd);
      if (inlineScript.includes('<script src="js/prompts.js">')) throw new Error('String.replace token corruption detected.');
      if (encrypted && !inlineScript.includes('decryptData(')) throw new Error('Encrypted bootstrap missing.');
      if (encrypted && !inlineScript.includes('window.prompt("Password")')) throw new Error('Password prompt implementation missing.');
      if (encrypted && !inlineScript.includes('api_keys = merge_api_key_defaults(embedded_api_keys);')) throw new Error('Encrypted export must preserve user-saved credential overrides.');
      if (!encrypted && !inlineScript.includes('var api_keys = merge_api_key_defaults(')) throw new Error('Unencrypted export must treat embedded API keys as defaults.');
      if (!inlineScript.includes('clear_popup_output();\n  location.reload();\n  return;')) throw new Error('Save Credentials must clear the failed run and return Home in standalone exports.');
      if (!inlineScript.includes('https://api.openai.com/v1/responses?x=')) throw new Error('Export bootstrap did not embed the effective default endpoint.');
      const forbidden = ['id="logs_toggle"', 'Interaction logs', 'debug_log_entries', 'debugRecordPostRun', '.debug-log-card'].filter((token) => html.includes(token));
      if (forbidden.length) {
        throw new Error('Standalone exports must not contain interaction logging UI, state, runtime code, or CSS: ' + forbidden.join(', '));
      }
      const jsPath = path.join(tempDir, `export-${scratch}-${!!encrypted}.js`);
      fs.writeFileSync(jsPath, inlineScript);
      childProcess.execFileSync(process.execPath, ['--check', jsPath], { stdio: 'pipe' });
    }
  }
  console.log('Standalone export regression tests passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
