import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('./artifacts/api-server/package.json', import.meta.url));
const WebSocket = require('ws');
const WS_URL = process.env.WS_URL ?? 'ws://127.0.0.1:8080/api/ws';
const MAP_W = 3224;
const MAP_H = 1858;
const WIRE_SCALE = 32000;
const KILL_RANGE_PX = Math.round((MAP_W / 104) * 1.5);
const REPORT_RANGE_PX = Math.round((MAP_W / 104) * 2.5);
const KILL_COOLDOWN_MS = 15_000;

function connect(id, username) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'nodebuffer';
    const state = { ws, id, username, slot: null, msgs: [], closed: false };
    const timer = setTimeout(() => reject(new Error('auth handshake timed out for ' + username)), 5000);
    ws.on('close', () => { state.closed = true; });
    ws.on('open', () => ws.send(JSON.stringify({ id, username })));
    ws.on('message', data => {
      const packet = Buffer.from(data);
      state.msgs.push(packet);
      if (packet[0] === 0x10 && packet[1] === 0x05 && packet.length >= 3) {
        state.slot = packet.readUInt8(2);
      }
      if (packet[0] === 0x01) {
        clearTimeout(timer);
        resolve(state);
      }
    });
    ws.on('error', error => {
      clearTimeout(timer);
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
    const cleanup = () => {
      clearTimeout(timer);
      state.ws.off('message', onMessage);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for ' + description + ' (' + state.username + ')'));
    }, timeoutMs);
    const onMessage = data => {
      const packet = Buffer.from(data);
      if (!predicate(packet)) return;
      cleanup();
      resolve(packet);
    };
    state.ws.on('message', onMessage);
  });
}

function parseRoomCode(packet) {
  assert.equal(packet[0], 0x10);
  assert.equal(packet[1], 0x03);
  assert.ok(packet.length >= 10, 'room update contains the six-byte room code');
  return packet.subarray(4, 10).toString('ascii').trim();
}

function readPosition(packet, slot) {
  if (packet[0] !== 0xff || packet.length !== 2 + packet[1] * 5) return null;
  for (let index = 0; index < packet[1]; index++) {
    const offset = 2 + index * 5;
    if (packet.readUInt8(offset) !== slot) continue;
    return {
      x: packet.readInt16LE(offset + 1) / WIRE_SCALE * MAP_W,
      y: packet.readInt16LE(offset + 3) / WIRE_SCALE * MAP_H,
    };
  }
  return null;
}

function latestPosition(state, slot) {
  for (let index = state.msgs.length - 1; index >= 0; index--) {
    const position = readPosition(state.msgs[index], slot);
    if (position) return position;
  }
  return null;
}

function wirePosition(x, y) {
  const packet = Buffer.alloc(5);
  packet.writeUInt8(0x11, 0);
  packet.writeInt16LE(Math.round(x / MAP_W * WIRE_SCALE), 1);
  packet.writeInt16LE(Math.round(y / MAP_H * WIRE_SCALE), 3);
  return packet;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

async function movePlayerTo(state, slot, start, destination) {
  const totalDistance = distance(start, destination);
  const steps = Math.max(1, Math.ceil(totalDistance / 8));
  let lastPosition = start;
  for (let index = 1; index <= steps; index++) {
    const fraction = index / steps;
    const target = {
      x: start.x + (destination.x - start.x) * fraction,
      y: start.y + (destination.y - start.y) * fraction,
    };
    send(state, wirePosition(target.x, target.y));
    const packet = await waitFor(
      state,
      message => {
        const actual = readPosition(message, slot);
        return actual !== null && distance(actual, target) <= 2.5;
      },
      2500,
      'server-authoritative position for slot ' + slot,
    );
    lastPosition = readPosition(packet, slot);
  }
  return lastPosition;
}

async function main() {
  const sockets = [];
  try {
    const host = await connect(91001, 'ReportE2EHost');
    sockets.push(host);
    send(host, [0x10, 0x01]);
    await waitFor(host, packet => packet[0] === 0x10 && packet[1] === 0x05);
    const roomPacket = await waitFor(host, packet => packet[0] === 0x10 && packet[1] === 0x03);
    const roomCode = parseRoomCode(roomPacket);

    const guests = [];
    for (let index = 0; index < 3; index++) {
      const guest = await connect(91002 + index, 'ReportE2EGuest' + index);
      sockets.push(guest);
      guests.push(guest);
      send(guest, [0x10, 0x02, ...Buffer.from(roomCode, 'ascii')]);
      await waitFor(guest, packet => packet[0] === 0x10 && packet[1] === 0x05);
      await waitFor(guest, packet =>
        packet[0] === 0x10 && packet[1] === 0x03 && packet[2] === index + 2,
      );
    }
    const players = [host, ...guests];
    assert.deepEqual(players.map(player => player.slot), [0, 1, 2, 3]);

    send(host, [0x12]);
    const roles = await Promise.all(players.map(player =>
      waitFor(player, packet => packet[0] === 0x1a, 5000, 'server role assignment'),
    ));
    for (const player of players) send(player, [0x23]);
    await Promise.all(players.map(player =>
      waitFor(player, packet => packet[0] === 0x24 && packet[1] === 0x01, 3000, 'gameplay readiness'),
    ));

    const spawnFrame = await waitFor(
      host,
      packet => packet[0] === 0xff && packet[1] === 4 && packet.length === 22,
      5000,
      'four authoritative spawn positions',
    );
    const positions = new Map(players.map(player => [player.slot, readPosition(spawnFrame, player.slot)]));
    assert.ok([...positions.values()].every(Boolean), 'spawn frame contains every player position');

    const impostor = players.find((player, index) => roles[index][1] === 0x01);
    const crewmates = players.filter((player, index) => roles[index][1] === 0x00);
    assert.ok(impostor, 'server assigns one impostor');
    assert.equal(crewmates.length, 3, 'four-player match has three crewmates');

    const victim = crewmates[0];
    const reporter = crewmates
      .slice(1)
      .sort((a, b) => distance(positions.get(b.slot), positions.get(victim.slot)) -
        distance(positions.get(a.slot), positions.get(victim.slot)))[0];
    const attackerStart = positions.get(impostor.slot);
    const victimPosition = positions.get(victim.slot);
    const reporterStart = positions.get(reporter.slot);
    assert.ok(distance(reporterStart, victimPosition) > REPORT_RANGE_PX + 5,
      'reporter starts outside the authoritative report radius so the negative probe is meaningful');

    console.log('--- Wait for the actual 15-second server kill cooldown ---');
    await sleep(KILL_COOLDOWN_MS + 250);

    console.log('--- Move impostor through real movement intents into kill range ---');
    await sleep(220); // accrue the server's initial 200ms movement-credit window
    const attackerVector = {
      x: attackerStart.x - victimPosition.x,
      y: attackerStart.y - victimPosition.y,
    };
    const attackerLength = Math.hypot(attackerVector.x, attackerVector.y);
    assert.ok(attackerLength > KILL_RANGE_PX + 10, 'selected victim starts outside kill range');
    const killPosition = {
      x: victimPosition.x + attackerVector.x / attackerLength * (KILL_RANGE_PX * 0.55),
      y: victimPosition.y + attackerVector.y / attackerLength * (KILL_RANGE_PX * 0.55),
    };
    const movedAttacker = await movePlayerTo(impostor, impostor.slot, attackerStart, killPosition);
    assert.ok(distance(movedAttacker, victimPosition) <= KILL_RANGE_PX,
      'server-acknowledged movement places impostor inside kill range');

    console.log('--- Kill crewmate and verify body is broadcast to every real client ---');
    send(impostor, [0x15, 0x01, victim.slot]);
    await Promise.all(players.map(player => waitFor(
      player,
      packet => packet[0] === 0x15 && packet[1] === 0x01 &&
        packet[2] === victim.slot && packet[3] === impostor.slot,
      3000,
      'authoritative kill broadcast',
    )));
    await Promise.all(players.map(player => waitFor(
      player,
      packet => packet[0] === 0x21 && packet[1] === victim.slot,
      3000,
      'immutable corpse position broadcast',
    )));

    console.log('--- Reject corpse report from outside the report radius ---');
    const meetingCountBeforeRejectedReport = players.map(player =>
      player.msgs.filter(packet => packet[0] === 0x1b).length);
    send(reporter, [0x13, victim.slot]);
    await sleep(180);
    assert.deepEqual(players.map(player =>
      player.msgs.filter(packet => packet[0] === 0x1b).length), meetingCountBeforeRejectedReport,
      'server does not start a meeting when the reporter is too far from the corpse');

    console.log('--- Move a different crewmate into report range and report the corpse ---');
    const towardCorpse = {
      x: reporterStart.x - victimPosition.x,
      y: reporterStart.y - victimPosition.y,
    };
    const reporterLength = Math.hypot(towardCorpse.x, towardCorpse.y);
    const reportPosition = {
      x: victimPosition.x + towardCorpse.x / reporterLength * (REPORT_RANGE_PX * 0.6),
      y: victimPosition.y + towardCorpse.y / reporterLength * (REPORT_RANGE_PX * 0.6),
    };
    const movedReporter = await movePlayerTo(reporter, reporter.slot, reporterStart, reportPosition);
    assert.ok(distance(movedReporter, victimPosition) < REPORT_RANGE_PX,
      'server-acknowledged movement places reporter inside report range');

    send(reporter, [0x13, victim.slot]);
    const meetings = await Promise.all(players.map(player => waitFor(
      player,
      packet => packet[0] === 0x1b && packet[1] === reporter.slot && packet[2] === victim.slot,
      5000,
      'corpse-report meeting broadcast',
    )));
    assert.equal(meetings.length, 4);
    for (const packet of meetings) {
      assert.equal(packet[1], reporter.slot, 'meeting identifies the actual reporter');
      assert.equal(packet[2], victim.slot, 'meeting identifies the exact killed player/body');
    }
    console.log('--- Verify live discussion relay and reject votes before the discussion timer opens ---');
    const discussionText = 'I saw the body near the service bay. Did anyone witness the last movement?';
    const discussionBytes = Buffer.from(discussionText, 'utf8');
    send(reporter, [0x19, 0x01, discussionBytes.length, ...discussionBytes]);
    const relayedMessages = await Promise.all(players.map(player => waitFor(
      player,
      packet => packet[0] === 0x19 && packet[1] === 0x02 &&
        packet[2] === reporter.slot &&
        packet.subarray(4, 4 + packet[3]).toString('utf8') === discussionText,
      3000,
      'server-relayed meeting discussion message',
    )));
    assert.equal(relayedMessages.length, 4, 'discussion transcript is broadcast to all connected clients');

    const alivePlayers = players.filter(player => player.slot !== victim.slot);
    assert.equal(alivePlayers.length, 3);
    const earlyVoter = reporter; // a living crewmate, so the early vote is otherwise legal
    send(earlyVoter, [0x14, impostor.slot]);
    await sleep(150);
    assert.equal(players.some(player => player.msgs.some(packet => packet[0] === 0x1C)), false,
      'a vote sent during discussion must not prematurely tally the meeting');

    console.log('--- Wait for the authoritative 15-second discussion window, then vote to eject the impostor ---');
    await sleep(15_150);
    for (const voter of alivePlayers.filter(player => player.slot !== earlyVoter.slot)) {
      // The impostor votes for the reporter; the other crewmate votes for the impostor.
      send(voter, [0x14, voter.slot === impostor.slot ? reporter.slot : impostor.slot]);
    }
    await sleep(150);
    assert.equal(players.some(player => player.msgs.some(packet => packet[0] === 0x1C)), false,
      'the server must wait for every connected living player vote before early tally');
    send(earlyVoter, [0x14, impostor.slot]);

    const voteResults = await Promise.all(players.map(player => waitFor(
      player,
      packet => packet[0] === 0x1C,
      3000,
      'authoritative meeting vote result and ejection',
    )));
    assert.equal(voteResults.length, 4, 'vote result is broadcast to every connected client');
    for (const result of voteResults) {
      assert.equal(result[1], impostor.slot, 'the plurality ejects the actual impostor slot');
      assert.equal(result[2], 0x01, 'ejecting the sole impostor ends the game for crewmates');
    }

    console.log('PASS: live four-client report → discussion chat → voting gate → all-player vote → impostor ejection and crew win');
    console.log('PASS: real four-client kill → corpse broadcast → out-of-range rejection → in-range body report → meeting broadcast');
  } finally {
    for (const player of sockets) {
      try { player.ws.close(); } catch {}
    }
  }
}

main().catch(error => {
  console.error('BODY REPORT E2E TEST FAILED:', error);
  process.exitCode = 1;
});
