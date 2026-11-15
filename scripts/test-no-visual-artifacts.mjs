import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const browserSmoke = read('./browser-smoke.mjs');
const atlasBrowser = read('./test-character-atlas-browser.mjs');
const workflow = read('../.github/workflows/ci.yml');
const plan = read('../MASTER_PLAN.md');

for (const [name, source] of [
  ['browser smoke', browserSmoke],
  ['character atlas browser test', atlasBrowser],
]) {
  assert.doesNotMatch(source, /\.screenshot\s*\(/, `${name} must not capture screenshots`);
  assert.doesNotMatch(source, /writeFileSync|VISUAL_QA_DIR|toDataURL\\s*\\(/,
    `${name} must not export generated visual artifacts`);
}

assert.doesNotMatch(workflow, /renderCollisionQa|among-gas-visual-qa|VISUAL_QA_DIR/,
  'CI must not render, upload, or request generated visual QA images');
assert.match(plan, /CODE-LEVEL QA \(no generated images\)/,
  'Plan 2 must keep screenshot-free code-level acceptance');
assert.match(plan, /Do not capture screenshots, render overlays, create image galleries or upload image artifacts/,
  'Plan 2 must explicitly prohibit generated visual artifacts');

console.log('Screenshot-free QA contract passed: browser tests retain assertions without image capture/export.');
