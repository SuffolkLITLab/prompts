#!/usr/bin/env python3
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
html = (root / 'options.html').read_text(encoding='utf-8')
js = (root / 'js/options.js').read_text(encoding='utf-8')
css = (root / 'css/options.css').read_text(encoding='utf-8')

assert '<details class="settings-help llm-endpoint-help">' in html
assert '<summary>Endpoint examples and provider details</summary>' in html
llm_start = html.index('<details class="settings-help llm-endpoint-help">')
llm_end = html.index('</details>', llm_start)
assert ' open' not in html[llm_start:html.index('>', llm_start)+1].lower()
assert '<ul>' in html[llm_start:llm_end]

assert 'id="javascript_browser_support"' in html
assert 'id="javascript_permission_status"' in html
assert 'this distributed package is currently the Firefox build' not in html
assert 'describeJavaScriptBrowserSupport' in js
assert "family === 'firefox'" in js
assert "family === 'chromium'" in js
assert 'Recheck JavaScript Status' in js
assert 'Enable JavaScript Templates' in js
assert '.settings-help' in css

assert '<details class="settings-help template-advanced-help">' in html
assert '<summary>Advanced template settings</summary>' in html
advanced_start = html.index('<details class="settings-help template-advanced-help">')
advanced_end = html.index('</details>', advanced_start)
advanced_open_tag_end = html.index('>', advanced_start) + 1
assert ' open' not in html[advanced_start:advanced_open_tag_end].lower()
advanced_block = html[advanced_start:advanced_end]
for heading in ['<h4>Advanced</h4>', '<h4>Endpoint routing and model controls</h4>', '<h4>Structured JSON</h4>', 'id="javascript_templates_heading">JavaScript Templates</h4>']:
    assert heading in advanced_block
assert '<details class="settings-help javascript-template-help">' not in html

assert '<div class="prompt-toolbar" role="group" aria-label="Template actions">' in html
toolbar_start = html.index('<div class="prompt-toolbar"')
toolbar_end = html.index('</div>', toolbar_start)
toolbar = html[toolbar_start:toolbar_end]
for control_id in ['add_prompt_to_list', 'downloadPrompts', 'uploadPrompts', 'restoreDefaults', 'deletePrompts']:
    assert f'id="{control_id}"' in toolbar
assert '.prompt-toolbar' in css

print('Settings cross-browser UI regression tests passed.')
