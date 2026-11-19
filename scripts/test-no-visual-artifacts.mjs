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
  assert.doesNotMatch(source, /writeFileSync|VISUAL_QA_DIR|toDataURL\s*\(/,
    `${name} must not export generated visual artifacts`);
}

assert.doesNotMatch(workflow, /renderCollisionQa|among-gas-visual-qa|VISUAL_QA_DIR/,
  'normal CI must remain free of generated visual QA images');

const reviewWorkflow = read('../.github/workflows/collision-source-art-review.yml');
const collisionRenderer = read('./renderCollisionQa.ts');
assert.match(reviewWorkflow, /workflow_dispatch:/,
  'source-art review crops must be explicitly runnable outside normal CI');
assert.ok(reviewWorkflow.includes('scripts/renderCollisionQa.ts'),
  'the isolated review workflow must use the canonical source-art renderer');
assert.ok(reviewWorkflow.includes('actions/upload-artifact@v7'),
  'review crops must be shared as a CI artifact rather than committed to runtime assets');
assert.match(reviewWorkflow, /retention-days: 7/,
  'review artifacts must expire automatically');
assert.doesNotMatch(reviewWorkflow, /vercel|replit.*publish|production deployment/i,
  'the source-art review workflow must not deploy or publish');

assert.match(collisionRenderer, /MAP_AUTHORING_ZONES/,
  'zone crops must use the canonical Z01–Z12 partition');
assert.match(collisionRenderer, /zoneReviewContextWorldPx = 24/,
  'each zone crop must include the required 24 world-pixel seam context');
assert.ok(collisionRenderer.includes('1FE850B3-71D3-486E-BF8F-88B9E1132380_1783601827918.png'),
  'zone crops must include the recovered original source artwork');
assert.ok(collisionRenderer.includes('collision-qa-zones'),
  'the renderer must emit a separate set of exact zone crops');

assert.ok(plan.includes('Normal CI and browser tests remain assertion-only and screenshot-free'),
  'Plan 2 must preserve screenshot-free normal CI');
assert.ok(plan.includes('collision-source-art-review.yml'),
  'Plan 2 must document the isolated reviewer-only crop workflow');
assert.ok(plan.includes('They do not substitute for source-author traces'),
  'Plan 2 must keep generated crops separate from human author/reviewer approval');

console.log('Screenshot-free QA contract passed: browser tests retain assertions without image capture/export.');
