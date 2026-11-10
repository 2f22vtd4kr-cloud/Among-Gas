import assert from 'node:assert/strict';
import { MAP_W, MAP_H } from '@workspace/shared/coords';
import { ADMIN_TABLE_DEFS } from '@workspace/shared/adminTable';
import { CHARACTER_CELL_HEIGHT } from './characterSprites';
import { drawWorldDetails } from './mapWorldDetailsRenderer';

type DrawCall = { name: string; args: unknown[] };

function recordingContext(): { context: CanvasRenderingContext2D; calls: DrawCall[] } {
  const calls: DrawCall[] = [];
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
  return { context, calls };
}

const sprite = {} as CanvasImageSource;
const base = {
  canvasWidth: MAP_W,
  canvasHeight: MAP_H,
  cameraX: 0,
  cameraY: 0,
  scale: 1,
  devicePixelRatio: 2,
  sprite,
  playerDisplayWidth: 100,
  playerDisplayHeight: 120,
  getSlotColor: (slot: number) => {
    assert.equal(slot, 3);
    return 'teal' as const;
  },
  getFrameRect: (_color: 'teal', pose: 'dead-body') => {
    assert.equal(pose, 'dead-body');
    return { x: 11.2, y: 702.4, width: 81.8, height: 45.5 };
  },
  clipCharacter: (
    _context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    pose: 'dead-body',
  ) => {
    assert.equal(pose, 'dead-body');
    assert.ok(width > 0 && height > 0);
    clipCalls += 1;
  },
};

let clipCalls = 0;
{
  const { context, calls } = recordingContext();
  drawWorldDetails({
    ...base,
    context,
    corpses: [{ slot: 3, x: 120, y: 180 }],
  });
  const draw = calls.find(call => call.name === 'drawImage');
  assert.ok(draw, 'visible corpse should draw its authored atlas frame');
  assert.equal(draw.args[0], sprite);
  const expectedHeight = Math.max(12, Math.round(120 * (45.5 / CHARACTER_CELL_HEIGHT) * 0.95));
  assert.deepEqual(draw.args.slice(1), [12, 703, 81, 44, 72.5, 180 - expectedHeight / 2, 95, expectedHeight],
    'corpse source crop and scaled destination should preserve the source pose aspect ratio');
  assert.equal(clipCalls, 1, 'corpse should retain its dedicated leg-gap clipping pass');
  assert.equal(calls.find(call => call.name === 'fillText')?.args[0], 'A',
    'Admin console marker should render after the corpse pass');
  assert.ok(calls.findIndex(call => call.name === 'drawImage') < calls.findIndex(call => call.name === 'fillText'),
    'corpse layer must precede the Admin console marker');
}

{
  const { context, calls } = recordingContext();
  drawWorldDetails({
    ...base,
    context,
    canvasWidth: 200,
    canvasHeight: 200,
    cameraX: 0,
    cameraY: 0,
    corpses: [{ slot: 3, x: MAP_W + 500, y: MAP_H + 500 }],
  });
  assert.equal(calls.filter(call => call.name === 'drawImage').length, 0,
    'off-screen corpses must be culled');
  assert.equal(clipCalls, 1, 'off-screen corpse must not run the clipping callback');
  assert.equal(calls.filter(call => call.name === 'fillText').length, 0,
    'off-screen Admin markers must be culled');
}

{
  const { context, calls } = recordingContext();
  drawWorldDetails({
    ...base,
    context,
    canvasWidth: MAP_W,
    canvasHeight: MAP_H,
    devicePixelRatio: 1,
    corpses: [],
  });
  const admin = ADMIN_TABLE_DEFS[0];
  const expectedX = Math.round((admin.x - base.cameraX) * base.scale);
  const expectedY = Math.round((admin.y - base.cameraY) * base.scale);
  const label = calls.find(call => call.name === 'fillText');
  assert.deepEqual(label?.args, ['A', expectedX, expectedY + 0.5],
    'Admin marker should preserve its world-to-screen transform and centre label');
}

console.log('Map world details renderer passed (corpse crop/clip, draw order, off-screen culling, Admin marker transform).');
