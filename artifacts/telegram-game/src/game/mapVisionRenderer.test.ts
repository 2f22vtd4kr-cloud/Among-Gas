import assert from 'node:assert/strict';
import { drawVisionFogOverlay } from './mapVisionRenderer';

type Call = { name: string; args: unknown[] };

function recordingContext() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {};
  const context = new Proxy({}, {
    get(_target, property) {
      if (typeof property === 'string' && property in state) return state[property];
      if (property === 'createRadialGradient') {
        return (...args: unknown[]) => {
          calls.push({ name: 'createRadialGradient', args });
          return { addColorStop: (...stopArgs: unknown[]) => calls.push({ name: 'addColorStop', args: stopArgs }) };
        };
      }
      return (...args: unknown[]) => calls.push({ name: String(property), args });
    },
    set(_target, property, value) {
      if (typeof property === 'string') state[property] = value;
      return true;
    },
  });
  return { context: context as CanvasRenderingContext2D, calls, state };
}

function recordingCanvas(width: number, height: number) {
  const state = { width, height };
  const canvas = new Proxy({}, {
    get(_target, property) {
      if (property in state) return state[property as keyof typeof state];
      return undefined;
    },
    set(_target, property, value) {
      if (property === 'width' || property === 'height') state[property] = value as number;
      return true;
    },
  });
  return { canvas: canvas as HTMLCanvasElement, state };
}

const polygon = [
  { x: 120, y: 220 },
  { x: 180, y: 220 },
  { x: 180, y: 280 },
  { x: 120, y: 280 },
];

{
  const { context, calls: fogCalls, state: fogState } = recordingContext();
  const { context: mainContext, calls: mainCalls } = recordingContext();
  const { canvas, state: canvasState } = recordingCanvas(0, 0);
  drawVisionFogOverlay({
    context: mainContext,
    fogContext: context,
    fogCanvas: canvas,
    canvasWidth: 800,
    canvasHeight: 600,
    cameraX: 100,
    cameraY: 200,
    scale: 2,
    playerScreenX: 40,
    playerScreenY: 50,
    visionRadiusScreenPx: 120,
    visiblePolygon: polygon,
  });
  assert.deepEqual(canvasState, { width: 800, height: 600 }, 'fog buffer should match the active viewport');
  assert.deepEqual(fogCalls.find(call => call.name === 'setTransform')?.args, [1, 0, 0, 1, 0, 0]);
  assert.ok(fogCalls.some(call => call.name === 'clearRect' && call.args[2] === 800 && call.args[3] === 600));
  assert.ok(fogCalls.some(call => call.name === 'fillRect' && call.args[2] === 800 && call.args[3] === 600));
  assert.deepEqual(fogCalls.find(call => call.name === 'moveTo')?.args, [40, 40], 'polygon should use the current camera transform');
  assert.ok(fogCalls.some(call => call.name === 'lineTo' && call.args[0] === 160 && call.args[1] === 40));
  assert.ok(fogCalls.some(call => call.name === 'clip'), 'visibility polygon should clip the reveal gradient');
  assert.deepEqual(fogCalls.find(call => call.name === 'createRadialGradient')?.args,
    [40, 50, 66, 40, 50, 120], 'gradient should retain the screen-space centre and radii');
  assert.deepEqual(fogCalls.filter(call => call.name === 'addColorStop').map(call => call.args),
    [[0, 'rgba(0,0,0,1)'], [0.82, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
  assert.equal(fogState.filter, 'none', 'iOS filter state should be reset after composition');
  assert.equal(fogCalls.filter(call => call.name === 'save').length, 1);
  assert.equal(fogCalls.filter(call => call.name === 'restore').length, 1);
  assert.equal(mainCalls.filter(call => call.name === 'drawImage').length, 1);
  assert.equal(mainCalls[0].args[0], canvas);
}

{
  const { context, calls } = recordingContext();
  const { context: mainContext, calls: mainCalls } = recordingContext();
  const { canvas } = recordingCanvas(640, 480);
  drawVisionFogOverlay({
    context: mainContext, fogContext: context, fogCanvas: canvas,
    canvasWidth: 640, canvasHeight: 480, cameraX: 0, cameraY: 0, scale: 1,
    playerScreenX: 20, playerScreenY: 20, visionRadiusScreenPx: 80,
    visiblePolygon: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
  });
  assert.ok(!calls.some(call => call.name === 'createRadialGradient'), 'degenerate polygons must not create a reveal gradient');
  assert.ok(!calls.some(call => call.name === 'clip'), 'degenerate polygons must not clip');
  assert.equal(mainCalls.filter(call => call.name === 'drawImage').length, 1, 'fallback fog should still be composited');
}

console.log('Map vision fog renderer passed (buffer resize, camera transform, clipped gradient, iOS filter reset, degenerate-polygon fallback).');
