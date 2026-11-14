import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('./artifacts/api-server/package.json', import.meta.url));
const WebSocket = require('ws');
const WS_URL = process.env.WS_URL ?? 'ws://127.0.0.1:8080/api/ws';

function connect(id, username) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'nodebuffer';
    const state = { ws, id, username, slot: null, msgs: [], closed: false };
    const timeout = setTimeout(() => reject(new Error('auth handshake timed out for ' + username)), 5000);

    ws.on('close', () => { state.closed = true; });
    ws.on('open', () => {
      ws.send(JSON.stringify({ id, username }));
    });
    ws.on('message', data => {
      const packet = Buffer.from(data);
      state.msgs.push(packet);
      if (packet[0] === 0x10 && packet[1] === 0x05 && packet.length >= 3) {
        state.slot = packet.readUInt8(2);
      }
      if (packet[0] === 0x01) {
        clearTimeout(timeout);
        resolve(state);
      }
    });
    ws.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function send(state, bytes) {
  assert.equal(state.ws.readyState, WebSocket.OPEN, 'socket must be open before sending');
  state.ws.send(Buffer.from(bytes));
}

function waitFor(state, predicate, timeoutMs = 5000, description = 'expected server packet') {
  const existing = state.msgs.find(predicate);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const onMessage = data => {
      const packet = Buffer.from(data);
      if (!predicate(packet)) return;
      cleanup();
      resolve(packet);
    };
    const cleanup = () => {
      clearTimeout(timer);
      state.ws.off('message', onMessage);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for ' + description + ' (' + state.username + ')'));
    }, timeoutMs);
    state.ws.on('message', onMessage);
  });
}

function waitForClose(state, timeoutMs = 3000) {
  if (state.closed || state.ws.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.ws.off('close', onClose);
      reject(new Error('Timed out waiting for superseded socket to close'));
    }, timeoutMs);
    const onClose = () => {
      clearTimeout(timer);
      resolve();
    };
    state.ws.once('close', onClose);
  });
}

function parseRoomCode(packet) {
  assert.equal(packet[0], 0x10);
  assert.equal(packet[1], 0x03);
  assert.ok(packet.length >= 10, 'room roster packet includes the six-byte code');
  return packet.subarray(4, 10).toString('ascii').trim();
}

async function main() {
  const sockets = [];
  try {
    const hostId = 981_001;
    const guestId = 981_002;
    const host = await connect(hostId, 'ReconnectHost');
    sockets.push(host);
    send(host, [0x10, 0x01]);
    const hostSlot = await waitFor(host, packet => packet[0] === 0x10 && packet[1] === 0x05);
    assert.equal(hostSlot[2], 0, 'host initially owns slot 0');
    const initialRoster = await waitFor(host, packet =>
      packet[0] === 0x10 && packet[1] === 0x03 && packet[2] === 1,
    );
    const roomCode = parseRoomCode(initialRoster);
    assert.match(roomCode, /^[A-HJ-NP-Z2-9]{6}$/);

    const guest = await connect(guestId, 'ReconnectGuest');
    sockets.push(guest);
    send(guest, [0x10, 0x02, ...Buffer.from(roomCode, 'ascii')]);
    const guestSlot = await waitFor(guest, packet => packet[0] === 0x10 && packet[1] === 0x05);
    assert.equal(guestSlot[2], 1, 'guest joins slot 1');
    await waitFor(guest, packet =>
      packet[0] === 0x10 && packet[1] === 0x03 && packet[2] === 2,
    );

    send(host, [0x12]);
    await Promise.all(sockets.map(socket =>
      waitFor(socket, packet => packet[0] === 0x1A, 5000, 'role reveal'),
    ));
    for (const socket of sockets) send(socket, [0x23]);
    await Promise.all(sockets.map(socket =>
      waitFor(socket, packet => packet[0] === 0x24 && packet[1] === 0x01, 3000, 'initial gameplay readiness'),
    ));

    // Reattach the same authenticated identity while the match is active.
    // The original TCP/WebSocket connection deliberately remains alive: this
    // also tests replacement and ensures its subsequent close event is stale.
    const replacement = await connect(hostId, 'ReconnectHost');
    sockets.push(replacement);
    send(replacement, [0x10, 0x02, ...Buffer.from(roomCode, 'ascii')]);

    const resumedSlot = await waitFor(replacement, packet =>
      packet[0] === 0x10 && packet[1] === 0x05,
    );
    assert.equal(resumedSlot[2], 0, 'reconnected identity must retain its original slot');

    const resumedRoster = await waitFor(replacement, packet =>
      packet[0] === 0x10 && packet[1] === 0x03 && packet[2] === 2,
    );
    assert.equal(parseRoomCode(resumedRoster), roomCode, 'reattachment must remain in the original room');

    const resumeFrame = await waitFor(replacement, packet => packet[0] === 0x25);
    assert.equal(resumeFrame[1], 0x01, 'resume snapshot schema version must be 1');
    const snapshot = JSON.parse(resumeFrame.subarray(2).toString('utf8'));
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.roomCode, roomCode);
    assert.equal(snapshot.phase, 'ROAMING');
    assert.equal(snapshot.mySlot, 0);
    assert.equal(snapshot.hostSlot, 0);
    assert.ok(Array.isArray(snapshot.players));
    assert.deepEqual(
      snapshot.players.map(player => player.slot).sort((a, b) => a - b),
      [0, 1],
      'snapshot roster preserves the same two slots',
    );
    assert.ok(Array.isArray(snapshot.playerPositions));
    const ownPosition = snapshot.playerPositions.find(position => position.slot === 0);
    assert.ok(ownPosition, 'snapshot contains the reconnecting player position');
    assert.equal(typeof ownPosition.wireX, 'number');
    assert.equal(typeof ownPosition.wireY, 'number');
    assert.equal(typeof ownPosition.inVent, 'boolean');
    assert.ok(['crewmate', 'impostor'].includes(snapshot.myRole));
    assert.ok(Array.isArray(snapshot.impostorSlots));
    assert.ok(Array.isArray(snapshot.myTasks));
    assert.ok(Array.isArray(snapshot.deadSlots));
    assert.ok(Array.isArray(snapshot.corpsePositions));
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'tgUserId'), false);
    assert.ok(snapshot.players.every(player =>
      !Object.prototype.hasOwnProperty.call(player, 'tgUserId'),
    ));
    assert.doesNotMatch(JSON.stringify(snapshot), /981001|981002/,
      'resume snapshot must not disclose Telegram user IDs');

    // Replacement closes the old transport. Its late close event must not
    // mark the already rebound player disconnected or erase its lobby entry.
    await waitForClose(host);
    assert.equal(host.closed, true, 'superseded socket is closed by the server');

    const readyCountBefore = replacement.msgs.filter(packet => packet[0] === 0x24 && packet[1] === 0x01).length;
    send(replacement, [0x23]);
    await waitFor(replacement, packet => packet[0] === 0x24 && packet[1] === 0x01, 3000,
      'targeted readiness acknowledgement after reconnect');
    await new Promise(resolve => setTimeout(resolve, 100));
    const readyCountAfter = replacement.msgs.filter(packet => packet[0] === 0x24 && packet[1] === 0x01).length;
    assert.equal(readyCountAfter, readyCountBefore + 1,
      'reconnect readiness acknowledgement is sent exactly once to the restored player');

    const guestReadyCount = guest.msgs.filter(packet => packet[0] === 0x24 && packet[1] === 0x01).length;
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(
      guest.msgs.filter(packet => packet[0] === 0x24 && packet[1] === 0x01).length,
      guestReadyCount,
      'a late reconnect must not rebroadcast readiness and disturb connected players',
    );

    // Reconnect a second client while the authoritative match is in DISCUSSION.
    // The restored player must receive the meeting snapshot, not a stale ROAMING
    // snapshot or a new lobby slot.
    send(replacement, [0x13, 0xFF]);
    await Promise.all([
      waitFor(replacement, packet => packet[0] === 0x1B && packet[1] === 0x00 && packet[2] === 0xFF,
        3000, 'emergency meeting on replacement host'),
      waitFor(guest, packet => packet[0] === 0x1B && packet[1] === 0x00 && packet[2] === 0xFF,
        3000, 'emergency meeting on connected guest'),
    ]);

    guest.ws.close();
    await waitForClose(guest);
    const reconnectedGuest = await connect(guestId, 'ReconnectGuest');
    sockets.push(reconnectedGuest);
    send(reconnectedGuest, [0x10, 0x02, ...Buffer.from(roomCode, 'ascii')]);
    const rejoinedSlot = await waitFor(reconnectedGuest, packet =>
      packet[0] === 0x10 && packet[1] === 0x05,
    );
    assert.equal(rejoinedSlot[2], 1, 'meeting reconnect must preserve the guest slot');
    await waitFor(reconnectedGuest, packet =>
      packet[0] === 0x10 && packet[1] === 0x03 && packet[2] === 2,
    );
    const meetingResumeFrame = await waitFor(reconnectedGuest, packet => packet[0] === 0x25);
    assert.equal(meetingResumeFrame[1], 0x01, 'meeting resume snapshot schema version must be 1');
    const meetingSnapshot = JSON.parse(meetingResumeFrame.subarray(2).toString('utf8'));
    assert.equal(meetingSnapshot.phase, 'MEETING');
    assert.equal(meetingSnapshot.mySlot, 1);
    assert.equal(meetingSnapshot.hostSlot, 0);
    assert.equal(meetingSnapshot.meeting.reporterSlot, 0);
    assert.equal(meetingSnapshot.meeting.bodySlot, 0xFF);
    assert.equal(meetingSnapshot.meeting.votingOpen, false,
      'a reconnect during discussion must not advance the meeting into voting');
    assert.equal(meetingSnapshot.meeting.hasVoted, false);
    assert.ok(Array.isArray(meetingSnapshot.meeting.messages));

    console.log('--- Reconnect the same client after the authoritative discussion timer opens voting ---');
    await new Promise(resolve => setTimeout(resolve, 15_150));
    reconnectedGuest.ws.close();
    await waitForClose(reconnectedGuest);
    const votingGuest = await connect(guestId, 'ReconnectGuest');
    sockets.push(votingGuest);
    send(votingGuest, [0x10, 0x02, ...Buffer.from(roomCode, 'ascii')]);
    const votingRejoinSlot = await waitFor(votingGuest, packet =>
      packet[0] === 0x10 && packet[1] === 0x05,
    );
    assert.equal(votingRejoinSlot[2], 1, 'voting reconnect must preserve the guest slot');
    await waitFor(votingGuest, packet =>
      packet[0] === 0x10 && packet[1] === 0x03 && packet[2] === 2,
    );
    const votingResumeFrame = await waitFor(votingGuest, packet => packet[0] === 0x25);
    const votingSnapshot = JSON.parse(votingResumeFrame.subarray(2).toString('utf8'));
    assert.equal(votingSnapshot.phase, 'MEETING');
    assert.equal(votingSnapshot.mySlot, 1);
    assert.equal(votingSnapshot.meeting.votingOpen, true,
      'a reconnect during voting must restore the authoritative open-vote state');
    assert.equal(votingSnapshot.meeting.hasVoted, false,
      'a player who disconnected before voting must not inherit a phantom vote');
    assert.ok(Array.isArray(votingSnapshot.meeting.messages));

    // Readiness is per-slot across reconnects, including a player who rejoins
    // after the meeting timer has opened voting. The vote handler deliberately
    // rejects actions until this restored transport acknowledges readiness.
    const votingReadyCount = votingGuest.msgs.filter(packet =>
      packet[0] === 0x24 && packet[1] === 0x01,
    ).length;
    send(votingGuest, [0x23]);
    await waitFor(votingGuest, packet => packet[0] === 0x24 && packet[1] === 0x01,
      3000, 'targeted readiness acknowledgement after voting reconnect');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(votingGuest.msgs.filter(packet =>
      packet[0] === 0x24 && packet[1] === 0x01,
    ).length, votingReadyCount + 1,
    'voting reconnect readiness must be acknowledged exactly once');

    send(replacement, [0x14, 1]);
    send(votingGuest, [0x14, 0]);
    const tieResults = await Promise.all([
      waitFor(replacement, packet => packet[0] === 0x1C, 3000, 'host vote result after voting reconnect'),
      waitFor(votingGuest, packet => packet[0] === 0x1C, 3000, 'restored guest vote result'),
    ]);
    for (const result of tieResults) {
      assert.equal(result[1], 0xFF, 'two opposing votes must preserve the no-ejection result');
      assert.equal(result[2], 0x00, 'a tied vote must not award either team a win');
    }

    console.log('PASS: live WebSocket reconnect during voting restores same slot, open ballot and valid no-ejection tally');
    console.log('PASS: live WebSocket reconnect during active meeting restores same slot and authoritative discussion state');
    console.log('PASS: live active-match WebSocket reconnect, same-slot identity, 0x25/v1 snapshot, old-socket retirement and targeted readiness');
  } finally {
    const closing = sockets.map(socket => socket.ws.readyState === WebSocket.CLOSED
      ? Promise.resolve()
      : new Promise(resolve => socket.ws.once('close', resolve)));
    for (const socket of sockets) {
      try { if (socket.ws.readyState !== WebSocket.CLOSED) socket.ws.close(); } catch {}
    }
    await Promise.all(closing);
  }
}

main().then(() => {
  // The server-side discussion timer is intentionally live; this standalone
  // integration process exits after all transports have been closed.
  process.exit(0);
}).catch(error => {
  console.error('WEBSOCKET RECONNECT TEST FAILED:', error);
  process.exit(1);
});
