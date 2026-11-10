import assert from 'node:assert/strict';
import { MAP_W, MAP_H } from '@workspace/shared/coords';
import { SABOTAGE_LIGHTS } from '@workspace/shared/sabotage';
import { TASK_DEFS } from '@workspace/shared/tasks';
import { drawWorldMarkers } from './mapMarkerRenderer';

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

const base = {
  canvasWidth: MAP_W,
  canvasHeight: MAP_H,
  devicePixelRatio: 1,
  cameraX: 0,
  cameraY: 0,
  scale: 1,
  meetingActive: false,
  nearestTaskId: null,
  trackedTaskId: null,
  role: 'crewmate',
  translateTaskName: (name: string | undefined) => name ?? 'Task',
  translateSabotageName: (name: string | undefined) => name ?? 'System',
};

{
  const { context, calls } = recordingContext();
  drawWorldMarkers({
    ...base,
    context,
    tasks: [{ taskId: 0, completedSteps: 0 }],
    sabotage: null,
  });
  const labels = calls.filter(call => call.name === 'fillText').map(call => call.args[0]);
  assert.ok(labels.includes(TASK_DEFS[0].name), 'unfinished task marker should retain its label');
  assert.equal(calls.filter(call => call.name === 'arc').length, 2, 'task marker should retain its glow and body circles');
}

{
  const { context, calls } = recordingContext();
  drawWorldMarkers({
    ...base,
    context,
    canvasWidth: 600,
    canvasHeight: 600,
    tasks: [{ taskId: 0, completedSteps: 0 }],
    sabotage: null,
    nearestTaskId: 0,
    trackedTaskId: 0,
  });
  const labels = calls.filter(call => call.name === 'fillText').map(call => call.args[0]);
  assert.ok(!labels.includes(TASK_DEFS[0].name), 'nearest task marker should remain suppressed beneath its action button');
  assert.ok(calls.some(call => call.name === 'rotate'), 'tracked off-screen task should retain its directional compass arrow');
}

{
  const { context, calls } = recordingContext();
  drawWorldMarkers({
    ...base,
    context,
    tasks: [],
    sabotage: { systemId: SABOTAGE_LIGHTS, fixedPads: [0], lockedTaskIds: [] },
  });
  const labels = calls.filter(call => call.name === 'fillText').map(call => call.args[0]);
  assert.deepEqual(labels, ['✓', 'Lights'], 'fixed sabotage pad should retain completion glyph and label');
  assert.equal(calls.filter(call => call.name === 'arc').length, 2, 'sabotage pad should retain its glow and body circles');
}

{
  const { context, calls } = recordingContext();
  drawWorldMarkers({
    ...base,
    context,
    tasks: [{ taskId: 0, completedSteps: 0 }],
    sabotage: null,
    meetingActive: true,
  });
  assert.equal(calls.length, 0, 'task markers should remain hidden during meetings');
}

console.log('Map world marker renderer passed (task label, nearest-task suppression, compass, sabotage state, meeting visibility).');
