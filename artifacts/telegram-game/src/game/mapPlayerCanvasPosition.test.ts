import assert from 'node:assert/strict';
import { getCharacterGhostMotion } from './characterGhostMotion';
import {
  getLocalPlayerCanvasPosition,
  getRemotePlayerCanvasPosition,
} from './mapPlayerCanvasPosition';

const camera = { sourceX: 3.2, sourceY: 7.1, scale: 0.73 };
const ghostMotion = {
  ...getCharacterGhostMotion(640, 2, 60, 90),
  driftX: 1.75,
  bobY: 4.25,
};

{
  const result = getRemotePlayerCanvasPosition({
    worldX: 100.35,
    worldY: 200.65,
    camera,
    ghost: true,
    ghostMotion,
    walkBobOffset: 99,
  });
  const groundY = Math.round((200.65 - camera.sourceY) * camera.scale);
  assert.deepEqual(result, {
    groundY,
    spriteX: Math.round((100.35 - camera.sourceX) * camera.scale + ghostMotion.driftX),
    spriteY: Math.round(groundY - ghostMotion.bobY),
  }, 'remote ghost keeps combined-coordinate rounding and ignores living walk bob');
}

{
  const result = getRemotePlayerCanvasPosition({
    worldX: 100.35,
    worldY: 200.65,
    camera,
    ghost: false,
    ghostMotion,
    walkBobOffset: 3.25,
  });
  const groundY = Math.round((200.65 - camera.sourceY) * camera.scale);
  assert.deepEqual(result, {
    groundY,
    spriteX: Math.round((100.35 - camera.sourceX) * camera.scale),
    spriteY: Math.round(groundY - 3.25),
  }, 'remote living player applies walk bob then rounds the final sprite position');
}

{
  const result = getLocalPlayerCanvasPosition({
    worldX: 100.35,
    worldY: 200.65,
    camera,
    ghost: true,
    ghostMotion,
    walkBobOffset: 99,
  });
  const groundX = Math.round((100.35 - camera.sourceX) * camera.scale);
  const groundY = Math.round((200.65 - camera.sourceY) * camera.scale);
  assert.deepEqual(result, {
    groundX,
    groundY,
    spriteX: groundX + ghostMotion.driftX,
    spriteY: groundY - ghostMotion.bobY,
  }, 'local ghost keeps its rounded ground anchor and adds unrounded float offsets');
}

{
  const result = getLocalPlayerCanvasPosition({
    worldX: 100.35,
    worldY: 200.65,
    camera,
    ghost: false,
    ghostMotion,
    walkBobOffset: 3.25,
  });
  const groundX = Math.round((100.35 - camera.sourceX) * camera.scale);
  const groundY = Math.round((200.65 - camera.sourceY) * camera.scale);
  assert.deepEqual(result, {
    groundX,
    groundY,
    spriteX: groundX,
    spriteY: groundY - 3.25,
  }, 'local living player keeps walk bob unrounded after its base anchor is rounded');
}

console.log('MAP PLAYER CANVAS POSITION TESTS PASSED: remote/local rounding, ghost float, walk bob and shadow anchor');
