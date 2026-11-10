import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('./artifacts/api-server/package.json', import.meta.url));
const WebSocket = require('ws');
const WS_URL = process.env.WS_URL ?? 'ws://127.0.0.1:8080/api/ws';

function connect(id, username) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'nodebuffer';
    const state = { ws, id, username, slot: null, messages: [] };
    const timer = setTimeout(() => reject(new Error('auth handshake timed out')), 5000);
    ws.on('open', () => ws.send(JSON.stringify({ id, username })));
    ws.on('message', data => {
      const packet = Buffer.from(data);
      state.messages.push(packet);
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
  assert.equal(state.ws.readyState, WebSocket.OPEN, 'socket must be open');
  state.ws.send(Buffer.from(bytes));
}

function waitFor(state, predicate, timeoutMs = 7000, description = 'expected packet') {
  const existing = state.messages.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      state.ws.off('message', onMessage);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for ' + description));
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

async function main() {
  let player;
  try {
    player = await connect(92001, 'SoloDiscussionHuman');
    send(player, [0x10, 0x06, 4]);
    const assigned = await waitFor(
      player,
      packet => packet[0] === 0x10 && packet[1] === 0x05,
      5000,
      'solo lobby slot assignment',
    );
    assert.equal(assigned[2], 0, 'the human owns slot 0 in a solo lobby');
    await waitFor(player, packet => packet[0] === 0x1a, 5000, 'server-assigned solo role');
    await waitFor(player, packet => packet[0] === 0xff, 5000, 'authoritative solo spawn frame');

    // The real client sends this only after map overview and character atlas
    // decode, so the test follows the same readiness gate.
    send(player, [0x23]);
    await waitFor(player, packet => packet[0] === 0x24 && packet[1] === 0x01,
      3000, 'solo gameplay readiness acknowledgement');

    console.log('--- Start a server-authoritative emergency meeting in a human-vs-four-bot lobby ---');
    send(player, [0x13, 0xff]);
    await waitFor(player, packet => packet[0] === 0x20 && packet[1] === 0x01,
      3000, 'server confirmation of the emergency call');
    const meeting = await waitFor(player, packet => packet[0] === 0x1b && packet[1] === 0 && packet[2] === 0xff,
      3000, 'emergency meeting broadcast');

    const humanText = 'I saw movement near the cafeteria. Can anyone give a confirmed sighting and timeline?';
    const messageBytes = Buffer.from(humanText, 'utf8');
    send(player, [0x19, 0x01, messageBytes.length, ...messageBytes]);

    const botReply = await waitFor(
      player,
      packet => packet[0] === 0x19 && packet[1] === 0x02 &&
        packet[2] !== player.slot && packet.length >= 5,
      7000,
      'a contextual discussion reply from a server-side bot',
    );
    const botSlot = botReply[2];
    const replyLength = botReply[3];
    const reply = botReply.subarray(4, 4 + replyLength).toString('utf8');
    assert.ok(botSlot >= 1 && botSlot <= 4, 'the reply must come from one of the four synthetic bot slots');
    assert.ok(replyLength > 0, 'the bot reply must be non-empty');
    assert.match(reply, /sighting|timeline|room|corridor|confirm|direct|witness|observation|observed/i,
      'the bot must respond to the public observation with a grounded clarification/evidence question');
    assert.ok(meeting.length >= 3, 'the human message followed a confirmed live server meeting');

    console.log('PASS: live solo human-vs-four-bots meeting produced a contextual bot chat reply', {
      botSlot,
      reply,
    });
  } finally {
    if (player) {
      try { player.ws.close(); } catch {}
    }
  }
}

main().catch(error => {
  console.error('SOLO BOT DISCUSSION E2E FAILED:', error);
  process.exitCode = 1;
});
