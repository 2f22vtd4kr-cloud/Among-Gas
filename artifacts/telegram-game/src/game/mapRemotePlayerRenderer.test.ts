import assert from 'node:assert/strict';
import type { CharacterPose } from './characterSprites';
import { drawRemotePlayerAppearance } from './mapRemotePlayerRenderer';

type Call = { name: string; args: unknown[] };
type PropertyWrite = { name: string; value: unknown };

function recordingContext(): {
  context: CanvasRenderingContext2D;
  calls: Call[];
  writes: PropertyWrite[];
  state: Record<string, unknown>;
} {
  const calls: Call[] = [];
  const writes: PropertyWrite[] = [];
  const state: Record<string, unknown> = {};
  const context = new Proxy({}, {
    get(_target, property) {
      if (typeof property === 'string' && property in state) return state[property];
      return (...args: unknown[]) => calls.push({ name: String(property), args });
    },
    set(_target, property, value) {
      if (typeof property === 'string') {
        state[property] = value;
        writes.push({ name: property, value });
      }
      return true;
    },
  }) as CanvasRenderingContext2D;
  return { context, calls, writes, state };
}

const sprite = {} as CanvasImageSource;
const frameRect = { x: 11.2, y: 702.4, width: 81.8, height: 45.5 };
const clipCalls: Array<{ x: number; y: number; width: number; height: number; pose: CharacterPose }> = [];
const base = {
  sprite,
  frameRect,
  pose: 'walk-1' as const,
  slot: 3,
  timestampMs: 500,
  screenX: 100,
  screenY: 80,
  groundY: 90,
  spriteWidth: 60,
  spriteHeight: 90,
  facingLeft: false,
  ghost: false,
  devicePixelRatio: 2,
  shadowScale: 0.8,
  name: 'Crew 3',
  labelColor: 'rgba(255,255,255,0.9)',
  clipCharacterLegGap: (
    _context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    pose: CharacterPose,
  ) => clipCalls.push({ x, y, width, height, pose }),
};

{
  const { context, calls, writes, state } = recordingContext();
  drawRemotePlayerAppearance({ ...base, context });

  const ellipseIndex = calls.findIndex(call => call.name === 'ellipse');
  const spriteIndex = calls.findIndex(call => call.name === 'drawImage');
  const strokeIndex = calls.findIndex(call => call.name === 'strokeText');
  const fillTextIndex = calls.findIndex(call => call.name === 'fillText');
  assert.ok(ellipseIndex >= 0, 'living remote player should draw a ground shadow');
  assert.ok(ellipseIndex < spriteIndex, 'ground shadow must precede the sprite');
  assert.ok(spriteIndex < strokeIndex && strokeIndex < fillTextIndex,
    'sprite must precede the outlined then filled nameplate');

  assert.deepEqual(calls[ellipseIndex].args, [
    100,
    90 + 90 * 0.55,
    60 * 0.34 * 0.8,
    90 * 0.07 * 0.8,
    0, 0, Math.PI * 2,
  ], 'shadow ellipse should preserve the ground anchor and movement compression');
  assert.deepEqual(calls[spriteIndex].args, [
    sprite,
    12, 703, 81, 44,
    -30, -45, 60, 90,
  ], 'atlas crop must use rounded source-pixel bounds and centred destination');

  assert.deepEqual(clipCalls.at(-1), {
    x: -30, y: -45, width: 60, height: 90, pose: 'walk-1',
  }, 'leg-gap clip uses the same centred frame and selected pose');
  assert.deepEqual(calls.find(call => call.name === 'translate')?.args, [100, 80]);
  assert.equal(state.imageSmoothingEnabled, true);
  assert.equal(state.imageSmoothingQuality, 'high');
  assert.equal(state.filter, 'none');
  assert.equal(state.fillStyle, 'rgba(255,255,255,0.9)');
  assert.equal(state.strokeStyle, 'rgba(0,0,0,0.7)');
  assert.equal(state.lineWidth, 4);
  assert.equal(state.font, 'bold 20px sans-serif');
  assert.equal(state.textAlign, 'center');
  assert.equal(state.textBaseline, 'bottom');
  assert.deepEqual(calls[strokeIndex].args, ['Crew 3', 100, 80 - 45 - 3]);
  assert.deepEqual(calls[fillTextIndex].args, calls[strokeIndex].args);
  assert.ok(writes.some(write => write.name === 'filter' && write.value === 'blur(5px)'));
}

{
  clipCalls.length = 0;
  const { context, calls, state } = recordingContext();
  drawRemotePlayerAppearance({
    ...base,
    context,
    pose: 'ghost',
    ghost: true,
    facingLeft: true,
    name: 'Player 3',
    labelColor: 'rgba(200,220,255,0.55)',
  });

  assert.equal(calls.some(call => call.name === 'ellipse'), false,
    'ghosts do not cast the living-player ground shadow');
  assert.equal(calls.some(call => call.name === 'fill'), false,
    'ghost appearance must not invoke the shadow fill pass');
  const rotate = calls.find(call => call.name === 'rotate');
  const scales = calls.filter(call => call.name === 'scale');
  assert.deepEqual(rotate?.args, [Math.sin(500 / 390 + 3 * 0.7) * 0.045],
    'ghost sway retains its slot/time phase');
  assert.deepEqual(scales.map(call => call.args), [
    [
      1 + Math.sin(500 / 275 + 3 * 0.9) * 0.025,
      1 - Math.sin(500 / 275 + 3 * 0.9) * 0.04,
    ],
    [-1, 1],
  ], 'ghost breathing transform precedes the facing flip');
  const alpha = calls.findIndex(call => call.name === 'translate');
  assert.ok(alpha >= 0);
  assert.equal(state.globalAlpha,
    0.46 + 0.1 * (0.5 + 0.5 * Math.sin(500 / 430 + 3 * 0.6)),
    'ghost transparency retains its original breathing pulse');
  assert.equal(state.fillStyle, 'rgba(200,220,255,0.55)',
    'ghost nameplate keeps its quiet blue-white colour');
  assert.equal(calls.find(call => call.name === 'fillText')?.args[0], 'Player 3');
  assert.deepEqual(clipCalls[0], {
    x: -30, y: -45, width: 60, height: 90, pose: 'ghost',
  });
}

{
  const { context, calls, state } = recordingContext();
  drawRemotePlayerAppearance({
    ...base,
    context,
    facingLeft: true,
    labelColor: 'rgba(255,80,80,0.95)',
  });
  assert.deepEqual(calls.find(call => call.name === 'scale')?.args, [-1, 1],
    'living player facing left uses the original horizontal flip');
  assert.equal(state.fillStyle, 'rgba(255,80,80,0.95)',
    'impostor teammate label colour is provided without duplicating role policy');
}

console.log('REMOTE PLAYER RENDERER TESTS PASSED: shadow order, atlas crop, leg clipping, ghost pulse, facing and nameplates');
