import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('./artifacts/api-server/package.json', import.meta.url));
const WebSocket = require('ws');
const WS_URL = process.env.WS_URL ?? 'ws://127.0.0.1:8080/api/ws';

function connect(id, username) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'nodebuffer';
    const state = { ws, slot: null, msgs: [] };
    const timeout = setTimeout(() => reject(new Error(`auth handshake timeout for ${username}`)), 5000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ id, username }));
    });
    ws.on('message', (data) => {
      const buf = Buffer.from(data);
      state.msgs.push(buf);

      // The first 0x01 packet confirms authentication only. Room slots arrive
      // later in [0x10, 0x05, slot] after creating or joining a lobby.
      if (buf[0] === 0x10 && buf[1] === 0x05 && buf.length >= 3) {
        state.slot = buf.readUInt8(2);
      }
      if (buf[0] === 0x01) {
        clearTimeout(timeout);
        state.authSlot = buf.readUInt8(1);
        resolve(state);
      }
    });
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function send(state, bytes) {
  assert.equal(state.ws.readyState, WebSocket.OPEN, 'socket must be open before sending');
  state.ws.send(Buffer.from(bytes));
}

function waitFor(state, predicate, timeoutMs = 5000) {
  const existing = state.msgs.find(predicate);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      state.ws.off('message', onMessage);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for message from slot ${state.slot ?? 'unassigned'}`));
    }, timeoutMs);
    const onMessage = (data) => {
      const buf = Buffer.from(data);
      if (predicate(buf)) {
        cleanup();
        resolve(buf);
      }
    };
    state.ws.on('message', onMessage);
  });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const players = [];
  try {
    console.log('--- Authenticate host and create lobby ---');
    const host = await connect(90001, 'HostSab');
    players.push(host);
    send(host, [0x10, 0x01]);
    await waitFor(host, b => b[0] === 0x10 && b[1] === 0x05);
    const roomMsg = await waitFor(host, b => b[0] === 0x10 && b[1] === 0x03);
    const roomCode = roomMsg.slice(4, 10).toString('ascii').trim();
    assert.match(roomCode, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(host.slot, 0, 'host must occupy slot 0');
    console.log('Room code:', roomCode, 'host slot:', host.slot);

    console.log('--- Join two players and verify unique authoritative slots ---');
    for (const [id, username, expectedSlot] of [[90002, 'P2Sab', 1], [90003, 'P3Sab', 2]]) {
      const player = await connect(id, username);
      players.push(player);
      send(player, [0x10, 0x02, ...Buffer.from(roomCode, 'ascii')]);
      await waitFor(player, b => b[0] === 0x10 && b[1] === 0x05);
      const update = await waitFor(player, b => b[0] === 0x10 && b[1] === 0x03 && b[2] === expectedSlot + 1);
      assert.equal(player.slot, expectedSlot, `${username} must receive slot ${expectedSlot}`);
      assert.equal(update[2], expectedSlot + 1, 'lobby update must include all joined players');
    }
    assert.deepEqual(players.map(p => p.slot), [0, 1, 2]);
    assert.equal(new Set(players.map(p => p.slot)).size, 3);
    console.log('Unique slots:', players.map(p => p.slot));

    console.log('--- Start game and verify server-assigned roles ---');
    send(host, [0x12]);
    const roles = await Promise.all(players.map(async player => ({
      player,
      packet: await waitFor(player, b => b[0] === 0x1A),
    })));
    const impostors = roles.filter(({ packet }) => packet[1] === 0x01);
    const crewmates = roles.filter(({ packet }) => packet[1] === 0x00);
    assert.equal(impostors.length, 1, 'a three-player game must have exactly one impostor');
    assert.equal(crewmates.length, 2, 'remaining players must be crewmates');
    const impostor = impostors[0].player;
    const crew = crewmates[0].player;
    console.log('Impostor slot:', impostor.slot, 'Crewmate slots:', crewmates.map(x => x.player.slot));

    console.log('--- Reject a forged movement teleport and return an authoritative correction ---');
    // Allow the server's 12ms packet interval guard to elapse after game start.
    await sleep(25);
    const forgedMove = Buffer.alloc(5);
    forgedMove.writeUInt8(0x11, 0);
    forgedMove.writeInt16LE(30_000, 1);
    forgedMove.writeInt16LE(30_000, 3);
    send(crew, forgedMove);
    const correction = await waitFor(crew, b => b[0] === 0x22, 2_000);
    assert.equal(correction.length, 5, 'movement correction must have a complete fixed-size frame');
    assert.notEqual(correction.readUInt16LE(1), 30_000,
      'the server must not echo the forged teleport x coordinate');
    assert.notEqual(correction.readUInt16LE(3), 30_000,
      'the server must not echo the forged teleport y coordinate');

    console.log('--- Reject a crewmate sabotage attempt ---');
    const priorStartCounts = players.map(p => p.msgs.filter(b => b[0] === 0x16 && b[1] === 0x01).length);
    send(crew, [0x15, 0x04, 0x01]);
    await sleep(350);
    assert.deepEqual(
      players.map(p => p.msgs.filter(b => b[0] === 0x16 && b[1] === 0x01).length),
      priorStartCounts,
      'server must not start sabotage for a crewmate request',
    );

    console.log('--- Accept impostor Lights sabotage and verify broadcast identity ---');
    send(impostor, [0x15, 0x04, 0x01]);
    const startMsg = await waitFor(crew, b => b[0] === 0x16 && b[1] === 0x01);
    assert.equal(startMsg[2], 0x01, 'expected Lights system ID');
    assert.equal(startMsg[3], impostor.slot, 'sabotage broadcast must identify the real impostor slot');
    for (const { player } of crewmates) {
      await waitFor(player, b => b[0] === 0x16 && b[1] === 0x01 && b[2] === 0x01 && b[3] === impostor.slot);
    }
    console.log('PASS: authenticated WebSocket lobby, slot allocation, role secrecy boundary, sabotage authorization and broadcast');
  } finally {
    for (const player of players) {
      try { player.ws.close(); } catch {}
    }
  }
}

main().catch(error => {
  console.error('TEST FAILED:', error);
  process.exitCode = 1;
});
