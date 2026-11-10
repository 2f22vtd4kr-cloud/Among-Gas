import assert from 'node:assert/strict';
import { clipCharacterLegGap } from './characterSpriteRenderer.js';

const calls: string[] = [];
const context = {
  beginPath: () => calls.push('beginPath'),
  moveTo: () => calls.push('moveTo'),
  lineTo: () => calls.push('lineTo'),
  closePath: () => calls.push('closePath'),
  clip: () => calls.push('clip'),
} as unknown as CanvasRenderingContext2D;

clipCharacterLegGap(context, 10, 20, 100, 200, 'idle');
assert.equal(calls[0], 'beginPath');
assert.equal(calls.filter(call => call === 'lineTo').length, 11);
assert.equal(calls.at(-2), 'closePath');
assert.equal(calls.at(-1), 'clip');

const untouched = new Proxy({}, {
  get() { throw new Error('poses without a leg-gap notch must not touch the canvas context'); },
}) as CanvasRenderingContext2D;
clipCharacterLegGap(untouched, 0, 0, 100, 200, 'walk-1');

console.log('Character sprite renderer clipping passed.');
