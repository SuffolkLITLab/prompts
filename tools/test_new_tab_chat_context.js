#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const prompts = fs.readFileSync(path.join(ROOT, 'js', 'prompts.js'), 'utf8');
const popup = fs.readFileSync(path.join(ROOT, 'js', 'popup.js'), 'utf8');

assert(prompts.includes('var chat_anchor_prompt = "";'), 'CHAT anchor state is missing');
assert(prompts.includes('chat_anchor_prompt: chat_anchor_prompt'), 'CHAT anchor is not persisted with session state');
assert(prompts.includes('chat_anchor_prompt = state.chat_anchor_prompt || "";'), 'CHAT anchor is not restored');
assert(prompts.includes('chat_anchor_prompt = String(llm_prompt || "");'), 'Resolved CHAT prompt is not captured as the anchor');
assert(popup.includes('if (isPersistentInteractionTab()) return;'), 'Persistent interaction tabs must ignore late global page-context broadcasts');

const start = prompts.indexOf('function ensure_chat_anchor_in_history(prompt_text)');
const end = prompts.indexOf('async function openai_call(prompt_text)', start);
assert(start >= 0 && end > start, 'CHAT anchor repair helper not found');
const helper = prompts.slice(start, end);

const ctx = {
  behavior: 'chat',
  chat_anchor_prompt: 'FULL SOURCE PAGE\n\nSummarize it and use it for follow-up questions.',
  llm_messages: [
    { role: 'assistant', content: 'Here is the 150-word summary.' }
  ],
  debugAddEvent: function() {}
};
vm.createContext(ctx);
vm.runInContext(helper, ctx);
const repaired = ctx.ensure_chat_anchor_in_history('What does the page say about remedies?');
assert.strictEqual(repaired, true, 'Missing CHAT source anchor should be repaired');
assert.strictEqual(ctx.llm_messages[0].role, 'user');
assert.strictEqual(ctx.llm_messages[0].content, ctx.chat_anchor_prompt, 'Original resolved prompt must be restored before the follow-up');

const before = ctx.llm_messages.length;
const repairedAgain = ctx.ensure_chat_anchor_in_history('Another question');
assert.strictEqual(repairedAgain, false, 'Existing CHAT anchor should not be duplicated');
assert.strictEqual(ctx.llm_messages.length, before, 'CHAT anchor must not be duplicated');

ctx.behavior = 'stop';
ctx.llm_messages = [];
assert.strictEqual(ctx.ensure_chat_anchor_in_history('Question'), false, 'Non-CHAT calls should not inject an anchor');
assert.strictEqual(ctx.llm_messages.length, 0);

console.log('New-tab CHAT context regression tests passed.');
