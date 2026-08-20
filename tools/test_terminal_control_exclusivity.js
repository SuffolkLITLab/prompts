const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const prompts = fs.readFileSync(path.join(root, 'js', 'prompts.js'), 'utf8');

if (!/function composerTerminalControlIsVisible\(\)[\s\S]*text_input[\s\S]*chat_text_input/.test(prompts)) {
  throw new Error('Expected shared composer visibility helper for text/chat inputs.');
}
if (!/function insert_restart\(\)[\s\S]*composerTerminalControlIsVisible\(\)[\s\S]*restart\.style\.display = 'none'[\s\S]*return;/.test(prompts)) {
  throw new Error('insert_restart() must refuse to show the standalone terminal control while a composer is visible.');
}
if (!/chat_text_input'\)\.style\.display='block';\s*suppressStandaloneTerminalForComposer\(\)/.test(prompts)) {
  throw new Error('CHAT composer display must suppress the standalone terminal control.');
}
if (!/text_input'\)\.style\.display='block';\s*suppressStandaloneTerminalForComposer\(\)/.test(prompts)) {
  throw new Error('Prompt-question composer display must suppress the standalone terminal control.');
}
if (!/state\.ui\.chat_user_input[\s\S]*suppressStandaloneTerminalForComposer\(\)/.test(prompts)) {
  throw new Error('Restored composer state must suppress a persisted standalone terminal control.');
}
console.log('Terminal control exclusivity regression checks passed.');
