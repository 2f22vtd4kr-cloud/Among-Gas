import assert from 'node:assert/strict';
import type { CharacterPose } from './characterSprites';
import { drawLocalPlayerAppearance } from './mapLocalPlayerRenderer';
import { getCharacterGhostMotion } from './characterGhostMotion';

type Call = { name: string; args: unknown[] };
function recordingContext(): { context: CanvasRenderingContext2D; calls: Call[]; state: Record<string, unknown> } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {};
  const context = new Proxy({}, {
    get(_target, property) {
      if (typeof property === 'string' && property in state) return state[property];
      return (...args: unknown[]) => calls.push({ name: String(property), args });
    },
    set(_target, property, value) {
      if (typeof property === 'string') state[property] = value;
      return true;
    },
  }) as CanvasRenderingContext2D;
  return { context, calls, state };
}
const sprite = {} as CanvasImageSource;
const clipCalls: unknown[][] = [];
const base = {
  sprite,
  frameRect: { x: 11.2, y: 702.4, width: 81.8, height: 45.5 },
  pose: 'walk-2' as const,
  ghostMotion: getCharacterGhostMotion(640, 2, 60, 90),
  shadowX: 120,
  shadowY: 85,
  spriteX: 124,
  spriteY: 79,
  spriteWidth: 60,
  spriteHeight: 90,
  facingLeft: false,
  ghost: false,
  shadowScale: 0.76,
  clipCharacterLegGap: (
    _ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, pose: CharacterPose,
  ) => clipCalls.push([x, y, width, height, pose]),
};

{
  const { context, calls, state } = recordingContext();
  drawLocalPlayerAppearance({ ...base, context });
  const shadow = calls.findIndex(c => c.name === 'ellipse');
  const draw = calls.findIndex(c => c.name === 'drawImage');
  assert.ok(shadow >= 0 && shadow < draw, 'local ground shadow precedes sprite');
  assert.deepEqual(calls[shadow].args, [
    120, 85 + 90 * 0.55, 60 * 0.34 * 0.76, 90 * 0.07 * 0.76, 0, 0, Math.PI * 2,
  ], 'shadow retains the unshifted ground anchor and walk compression');
  assert.deepEqual(calls.find(c => c.name === 'translate')?.args, [124, 79],
    'sprite uses GameMap-computed ghost/walk-adjusted screen position');
  assert.deepEqual(calls[draw].args, [sprite, 12, 703, 81, 44, -30, -45, 60, 90],
    'local atlas source crop and centred destination remain pixel-identical');
  assert.deepEqual(clipCalls[0], [-30, -45, 60, 90, 'walk-2']);
  assert.equal(state.imageSmoothingEnabled, true);
  assert.equal(state.imageSmoothingQuality, 'high');
  assert.equal(state.filter, 'none');
}

{
  clipCalls.length = 0;
  const { context, calls, state } = recordingContext();
  drawLocalPlayerAppearance({
    ...base, context, ghost: true, pose: 'ghost', facingLeft: true, slot: 2,
  });
  assert.equal(calls.some(c => c.name === 'ellipse'), false, 'ghost has no ground shadow');
  assert.deepEqual(calls.find(c => c.name === 'translate')?.args, [124, 79]);
  assert.deepEqual(calls.find(c => c.name === 'rotate')?.args, [base.ghostMotion.rotationRad]);
  assert.deepEqual(calls.filter(c => c.name === 'scale').map(c => c.args), [
    [base.ghostMotion.scaleX, base.ghostMotion.scaleY],
    [-1, 1],
  ], 'ghost pulse/sway precedes facing flip');
  assert.equal(state.globalAlpha, base.ghostMotion.opacity);
  assert.deepEqual(clipCalls[0], [-30, -45, 60, 90, 'ghost']);
}
console.log('LOCAL PLAYER RENDERER TESTS PASSED: shadow anchor, atlas crop, clipping, ghost pulse, facing and smoothing');
