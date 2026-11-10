import assert from 'node:assert/strict';
import { getCharacterGhostMotion } from './characterGhostMotion';

const timestampMs = 640;
const slot = 2;
const spriteWidth = 60;
const spriteHeight = 90;
const motion = getCharacterGhostMotion(timestampMs, slot, spriteWidth, spriteHeight);

const phase = timestampMs / 245 + slot * 0.8;
const pulse = Math.sin(timestampMs / 275 + slot * 0.9);
const sway = Math.sin(timestampMs / 390 + slot * 0.7);
assert.deepEqual(motion, {
  bobY: Math.sin(phase) * Math.max(2.5, spriteHeight * 0.13),
  driftX: Math.sin(timestampMs / 335 + slot * 1.1) * Math.max(1.5, spriteWidth * 0.06),
  rotationRad: sway * 0.045,
  scaleX: 1 + pulse * 0.025,
  scaleY: 1 - pulse * 0.04,
  opacity: 0.46 + 0.1 * (0.5 + 0.5 * Math.sin(timestampMs / 430 + slot * 0.6)),
}, 'ghost bob, drift, rotation, breathing scale and opacity preserve the established animation curves');

const nextSlotMotion = getCharacterGhostMotion(timestampMs, slot + 1, spriteWidth, spriteHeight);
assert.notEqual(nextSlotMotion.bobY, motion.bobY, 'each slot retains its independent float phase');
assert.notEqual(nextSlotMotion.driftX, motion.driftX, 'each slot retains its independent lateral phase');

const taller = getCharacterGhostMotion(timestampMs, slot, spriteWidth, spriteHeight * 2);
const wider = getCharacterGhostMotion(timestampMs, slot, spriteWidth * 2, spriteHeight);
assert.equal(taller.bobY, Math.sin(phase) * Math.max(2.5, spriteHeight * 2 * 0.13),
  'vertical float amplitude tracks the measured pose height');
assert.equal(wider.driftX, Math.sin(timestampMs / 335 + slot * 1.1) * Math.max(1.5, spriteWidth * 2 * 0.06),
  'lateral float amplitude tracks the measured sprite width');

console.log('CHARACTER GHOST MOTION TESTS PASSED: local/remote phases, drift, bob, breathing and alpha');
