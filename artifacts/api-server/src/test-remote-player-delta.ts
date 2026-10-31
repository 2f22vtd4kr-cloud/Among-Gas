import assert from 'node:assert/strict';
import { applyDeltaPacket } from '../../telegram-game/src/context/GameContext.tsx';

const players = new Map<number, { slot: number; x: number; y: number; inVent?: boolean }>([
  [0, { slot: 0, x: 100, y: 100 }],
  [1, { slot: 1, x: 200, y: 200 }],
]);
const buffer = new ArrayBuffer(12);
const view = new DataView(buffer);
view.setUint8(0, 0xff);
view.setUint8(1, 2);
view.setUint8(2, 0);
view.setInt16(3, 120, true);
view.setInt16(5, 130, true);
view.setUint8(7, 1);
view.setInt16(8, 240, true);
view.setInt16(10, 250, true);
let corrections = 0;

applyDeltaPacket(view, 0, players, () => { corrections++; });
assert.equal(corrections, 1, 'the local authoritative echo still reconciles prediction');
assert.equal(players.has(0), false, 'a stale local remote-sprite entry is removed');
assert.equal(players.has(1), true, 'other players remain in the remote sprite map');
assert.equal(players.get(1)?.x, 240 * (3224 / 32767), 'remote positions still decode from wire coordinates');
console.log('PASS: local slot is never retained as a duplicate remote sprite');
