import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';

// This is a protocol-level integration test. Force the non-production auth
// path before importing wsServer so no real Telegram token is needed.
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_BOT_TOKEN = 'DEBUG_MOCK_TOKEN';
process.env.LOG_LEVEL = 'silent';

const { attachWsServer } = await import('./wsServer.js');

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForPacket(
  packets: Buffer[],
  predicate: (packet: Buffer) => boolean,
  label: string,
  timeoutMs = 5_000,
): Promise<Buffer> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const index = packets.findIndex(predicate);
    if (index >= 0) return packets.splice(index, 1)[0];
    await delay(10);
  }
  throw new Error('Timed out waiting for solo-flow packet: ' + label);
}

const server = createServer();
const wss = attachWsServer(server);
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object', 'test HTTP server must bind an ephemeral port');

const host = new WebSocket('ws://127.0.0.1:' + address.port + '/api/ws');
const packets: Buffer[] = [];
host.on('message', data => packets.push(Buffer.from(data as Buffer)));

try {
  await once(host, 'open');
  host.send(JSON.stringify({ id: 990001, username: 'SoloHost' }));
  const ack = await waitForPacket(packets, packet => packet[0] === 0x01, 'authenticated slot assignment');
  assert.deepEqual([...ack], [0x01, 0x00], 'solo host must own slot zero');

  // A deterministic shuffle keeps the host crewmate so the test can also
  // verify the private task-assignment packet. The server's normal role
  // assignment code is still the code under test.
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    host.send(Buffer.from([0x10, 0x06, 4]));
    const role = await waitForPacket(
      packets,
      packet => packet[0] === 0x1A,
      'automatic role reveal',
    );
    assert.deepEqual([...role], [0x1A, 0x00], 'deterministic solo host should receive the crewmate role');

    const tasks = await waitForPacket(
      packets,
      packet => packet[0] === 0x1D,
      'private crewmate task assignment',
    );
    assert.ok(tasks[1] > 0, 'solo host must receive at least one assigned task');
    // Match the real client: movement and bot ticks stay behind the asset-ready barrier.
    host.send(Buffer.from([0x23]));
    const ready = await waitForPacket(packets, packet => packet[0] === 0x24, 'gameplay-ready barrier');
    assert.equal(ready[0], 0x24, "server must acknowledge the solo client's gameplay-ready barrier");
  } finally {
    Math.random = originalRandom;
  }

  const delta = await waitForPacket(
    packets,
    packet => packet[0] === 0xFF && packet.length >= 2,
    'first authoritative player delta',
  );
  const playerCount = delta[1];
  assert.equal(playerCount, 5, 'solo flow must start one human plus exactly four bots');
  const slots = Array.from({ length: playerCount }, (_, index) => delta[2 + index * 5]);
  assert.deepEqual(slots, [0, 1, 2, 3, 4], 'authoritative delta must include the host and all four bot slots');

  // Capture the server-authoritative starting positions. The packet uses one
  // five-byte record per moving player: slot + signed 16-bit wire X/Y.
  const initialBotPositions = new Map<number, { x: number; y: number }>();
  for (let index = 0; index < playerCount; index++) {
    const offset = 2 + index * 5;
    const slot = delta[offset];
    if (slot === 0) continue;
    initialBotPositions.set(slot, {
      x: delta.readInt16LE(offset + 1),
      y: delta.readInt16LE(offset + 3),
    });
  }
  assert.equal(initialBotPositions.size, 4, 'the initial authoritative snapshot must include four bot positions');

  assert.equal(
    packets.some(packet => packet[0] === 0x10 && packet[1] === 0x03),
    false,
    'solo room must not broadcast a joinable room-code update',
  );

  // Protocol setup alone is not a playable solo session: prove that the
  // server's live 5Hz AI loop actually advances at least one bot after the
  // host crosses the same gameplay-ready barrier as the real client.
  const movedBotSlots = new Set<number>();
  const movementDeadline = Date.now() + 8_000;
  while (Date.now() < movementDeadline && movedBotSlots.size === 0) {
    for (let index = packets.length - 1; index >= 0; index--) {
      const packet = packets[index];
      if (packet[0] !== 0xFF || packet.length < 7) continue;
      packets.splice(index, 1);
      const count = packet[1];
      for (let record = 0; record < count; record++) {
        const offset = 2 + record * 5;
        const slot = packet[offset];
        const initial = initialBotPositions.get(slot);
        if (!initial) continue;
        const x = packet.readInt16LE(offset + 1);
        const y = packet.readInt16LE(offset + 3);
        if (Math.abs(x - initial.x) + Math.abs(y - initial.y) >= 1) {
          movedBotSlots.add(slot);
        }
      }
    }
    if (movedBotSlots.size === 0) await delay(40);
  }
  assert.ok(
    movedBotSlots.size >= 1,
    'at least one of the four server-controlled bots must move after the solo gameplay-ready barrier',
  );

  console.log(
    'PASS: CREATE_SOLO authenticates, starts, assigns role/tasks, syncs four bots, advances live bot movement, and keeps the room private',
  );
} finally {
  host.close();
  await once(host, 'close').catch(() => {});
  await delay(30);
  await new Promise<void>(resolve => wss.close(() => resolve()));
  await new Promise<void>(resolve => server.close(() => resolve()));
}
