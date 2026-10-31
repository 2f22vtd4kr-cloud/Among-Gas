import assert from 'node:assert/strict';
import {
  readLobbyStartParam,
  resolveInitialRoomCode,
} from '../artifacts/telegram-game/src/lib/telegramStartParam.js';

assert.equal(readLobbyStartParam('', 'abc234'), 'ABC234',
  'Telegram initDataUnsafe.start_param must be normalized to a valid lobby code');
assert.equal(readLobbyStartParam('?tgWebAppStartParam=xy2345'), 'XY2345',
  'Telegram WebView start parameter query must be supported');
assert.equal(readLobbyStartParam('?startapp=ab2345'), 'AB2345',
  'the documented startapp invite query must be supported');
assert.equal(readLobbyStartParam('?start_param=CD2345'), 'CD2345',
  'the standard start_param query alias must be supported');
assert.equal(readLobbyStartParam('?startapp=bad-code&start_param=ef2345'), 'EF2345',
  'an invalid candidate must not hide a later valid invite parameter');
assert.equal(readLobbyStartParam('?startapp=AB1234'), null,
  'ambiguous letters and digits excluded by the room-code alphabet must be rejected');
assert.equal(readLobbyStartParam('?startapp=ABCDE'), null,
  'short invite parameters must be rejected');
assert.equal(readLobbyStartParam('?startapp=ABCDEFG'), null,
  'long invite parameters must be rejected');
assert.equal(readLobbyStartParam('', { code: 'AB2345' }), null,
  'non-string Telegram start parameters must be rejected');
assert.equal(readLobbyStartParam('', 'INVALID'), null,
  'invalid Telegram payload must not override a valid query fallback');
assert.equal(readLobbyStartParam('?startapp=ab2345', 'INVALID'), 'AB2345',
  'a malformed Telegram payload may fall back to a valid launch query');
assert.equal(resolveInitialRoomCode('AB2345', 'XY2345'), 'AB2345',
  'a valid fresh invite must override a room remembered by the WebView');
assert.equal(resolveInitialRoomCode(null, 'XY2345'), 'XY2345',
  'a remembered room must still resume when no valid invite was supplied');
assert.equal(resolveInitialRoomCode(null, null), null,
  'a fresh session without an invite or remembered room must start in the lobby');

console.log('PASS: Telegram Mini App start parameters resolve only valid six-character lobby invites');
