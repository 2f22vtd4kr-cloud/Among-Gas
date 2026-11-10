import assert from 'node:assert/strict';
import {
  IMPOSTOR_VISION_RADIUS_PX,
  LIGHTS_CREWMATE_VISION_RADIUS_PX,
  NORMAL_VISION_RADIUS_PX,
  SABOTAGE_LIGHTS,
  SABOTAGE_COMMS,
} from '@workspace/shared/sabotage';
import { getPlayerVisionRadius } from './mapVisionPolicy';

assert.equal(getPlayerVisionRadius('crewmate', false, null), NORMAL_VISION_RADIUS_PX,
  'a living crewmate gets normal base vision');
assert.equal(getPlayerVisionRadius('crewmate', false, SABOTAGE_LIGHTS), LIGHTS_CREWMATE_VISION_RADIUS_PX,
  'Lights sabotage reduces only crewmate vision');
assert.equal(getPlayerVisionRadius('crewmate', false, SABOTAGE_COMMS), NORMAL_VISION_RADIUS_PX,
  'non-Lights sabotage leaves crewmate vision unchanged');
assert.equal(getPlayerVisionRadius('impostor', false, null), IMPOSTOR_VISION_RADIUS_PX,
  'a living impostor gets the impostor sight radius');
assert.equal(getPlayerVisionRadius('impostor', false, SABOTAGE_LIGHTS), IMPOSTOR_VISION_RADIUS_PX,
  'Lights sabotage does not reduce impostor vision');
assert.equal(getPlayerVisionRadius('crewmate', true, null), null,
  'ghosts use unrestricted map visibility rather than a local sight polygon');
assert.equal(getPlayerVisionRadius('impostor', true, SABOTAGE_LIGHTS), null,
  'ghost visibility overrides role and sabotage');
assert.equal(getPlayerVisionRadius(null, false, null), null,
  'unknown role does not create a restricted local vision polygon');

console.log('MAP VISION POLICY TESTS PASSED: role, ghost and Lights sabotage visibility rules');
