const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const platformSource = fs.readFileSync(path.join(root, 'js', 'platform.js'), 'utf8');
const promptsSource = fs.readFileSync(path.join(root, 'js', 'prompts.js'), 'utf8');

async function testExtensionNavigation() {
  const calls = [];
  const browser = {
    runtime: {
      id: 'temporary-addon@example.test',
      getURL: p => `moz-extension://temporary-addon/${p}`,
      openOptionsPage: async () => { calls.push(['options']); }
    },
    tabs: {
      create: async props => { calls.push(['tab', props.url]); return { id: calls.length, ...props }; },
      query: async () => []
    }
  };
  const context = {
    browser,
    navigator: { userAgent: 'Mozilla/5.0 Firefox/143.0' },
    console,
    open: () => { throw new Error('window.open fallback must not be used in an extension context'); }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(platformSource, context, { filename: 'platform.js' });

  await context.LitPlatform.openOptionsPage();
  await context.LitPlatform.openInternalPage('scratch.html', 'scratch');
  await context.LitPlatform.openExternalPage('https://github.com/SuffolkLITLab/prompts', '_projectPage');

  const expected = [
    ['options'],
    ['tab', 'moz-extension://temporary-addon/scratch.html'],
    ['tab', 'https://github.com/SuffolkLITLab/prompts']
  ];
  if (JSON.stringify(calls) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected extension navigation calls: ${JSON.stringify(calls)}`);
  }
}

async function testStandaloneFallback() {
  const calls = [];
  const context = {
    navigator: { userAgent: 'Mozilla/5.0' },
    console,
    open: (url, target) => {
      calls.push([url, target]);
      // Deliberately return null: navigation helpers must not call .focus() blindly.
      return null;
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(platformSource, context, { filename: 'platform.js' });

  await context.LitPlatform.openOptionsPage();
  await context.LitPlatform.openInternalPage('scratch.html', 'scratch');
  await context.LitPlatform.openExternalPage('https://example.com/', '_blank');

  if (calls.length !== 3) throw new Error(`Expected 3 standalone window.open calls, got ${calls.length}`);
}

function testPopupUsesPlatformHelpers() {
  const required = [
    "LitPlatform.openOptionsPage()",
    "LitPlatform.openInternalPage('scratch.html', 'scratch')",
    "LitPlatform.openExternalPage('https://github.com/SuffolkLITLab/prompts'",
    "LitPlatform.openExternalPage('https://github.com/SuffolkLITLab/prompts/issues'"
  ];
  for (const marker of required) {
    if (!promptsSource.includes(marker)) throw new Error(`Missing popup navigation helper: ${marker}`);
  }
  const fragile = [
    'window.open("options.html"',
    'window.open("scratch.html"',
    'window.open("https://github.com/SuffolkLITLab/prompts"',
  ];
  for (const marker of fragile) {
    if (promptsSource.includes(marker)) throw new Error(`Fragile popup navigation remains: ${marker}`);
  }
}

(async () => {
  await testExtensionNavigation();
  await testStandaloneFallback();
  testPopupUsesPlatformHelpers();
  console.log('Native navigation regression checks passed.');
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
