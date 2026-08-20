const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const prompts = fs.readFileSync(path.join(root, 'js', 'prompts.js'), 'utf8');

const restartPos = html.indexOf('id="restartButton"');
const actionsPos = html.indexOf('class="transcript-actions"');
if (restartPos < 0 || actionsPos < 0 || restartPos > actionsPos) {
  throw new Error('Back Home must appear before the transcript action row in popup.html');
}
if (!/function insert_restart\(\)[\s\S]*insertBefore\(restart, transcript_actions\)/.test(prompts)) {
  throw new Error('insert_restart() must enforce Back Home placement before transcript actions');
}
const overflowBlock = prompts.match(/if \(\(finish_reason=="length"\) && \(behavior=="chat"\)\)[\s\S]*?\n\s*} else if \(behavior=="stop"\)/);
if (!overflowBlock || !/insert_restart\(\)/.test(overflowBlock[0])) {
  throw new Error('Continue Generation terminal path must use insert_restart()');
}
console.log('Back Home placement regression checks passed.');
