import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import WebSocket from "ws";

// Two independently authenticated clients exercise the real lobby and
// WebSocket protocol. This is deliberately not a mocked meeting fixture.
process.env.NODE_ENV = "test";
process.env.TELEGRAM_BOT_TOKEN = "DEBUG_MOCK_TOKEN";
process.env.LOG_LEVEL = "silent";

const { attachWsServer } = await import("./wsServer.js");
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
  throw new Error("Timed out waiting for " + label);
}

const server = createServer();
const wss = attachWsServer(server);
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const url = "ws://127.0.0.1:" + address.port + "/api/ws";
const host = new WebSocket(url);
const guest = new WebSocket(url);
const hostPackets: Buffer[] = [];
const guestPackets: Buffer[] = [];
host.on("message", data => hostPackets.push(Buffer.from(data as Buffer)));
guest.on("message", data => guestPackets.push(Buffer.from(data as Buffer)));

let failure: unknown;
try {
  await Promise.all([once(host, "open"), once(guest, "open")]);
  host.send(JSON.stringify({ id: 991001, username: "MeetingHost" }));
  guest.send(JSON.stringify({ id: 991002, username: "MeetingGuest" }));
  assert.deepEqual(
    [...await waitForPacket(hostPackets, packet => packet[0] === 0x01, "host auth")],
    [0x01, 0x00],
  );
  assert.deepEqual(
    [...await waitForPacket(guestPackets, packet => packet[0] === 0x01, "guest auth")],
    [0x01, 0x00],
  );

  host.send(Buffer.from([0x10, 0x01]));
  const created = await waitForPacket(
    hostPackets,
    packet => packet[0] === 0x10 && packet[1] === 0x03 && packet[2] === 1,
    "room creation broadcast",
  );
  const roomCode = created.subarray(4, 10).toString("ascii");
  assert.match(roomCode, /^[A-Z0-9]{6}$/);

  guest.send(Buffer.concat([Buffer.from([0x10, 0x02]), Buffer.from(roomCode, "ascii")]));
  await waitForPacket(hostPackets, packet => packet[0] === 0x10 && packet[1] === 0x03 && packet[2] === 2, "host sees second player");
  await waitForPacket(guestPackets, packet => packet[0] === 0x10 && packet[1] === 0x03 && packet[2] === 2, "guest joins room");

  host.send(Buffer.from([0x12]));
  await waitForPacket(hostPackets, packet => packet[0] === 0x1A, "host role assignment");
  await waitForPacket(guestPackets, packet => packet[0] === 0x1A, "guest role assignment");
  host.send(Buffer.from([0x23]));
  guest.send(Buffer.from([0x23]));
  await waitForPacket(hostPackets, packet => packet[0] === 0x24 && packet[1] === 0x01, "host gameplay-ready barrier");
  await waitForPacket(guestPackets, packet => packet[0] === 0x24 && packet[1] === 0x01, "guest gameplay-ready barrier");

  host.send(Buffer.from([0x13, 0xFF]));
  const hostMeeting = await waitForPacket(hostPackets, packet => packet[0] === 0x1B, "host emergency meeting broadcast");
  const guestMeeting = await waitForPacket(guestPackets, packet => packet[0] === 0x1B, "guest emergency meeting broadcast");
  assert.deepEqual([...hostMeeting], [0x1B, 0x00, 0xFF], "host sees the authoritative emergency caller and sentinel body");
  assert.deepEqual([...guestMeeting], [...hostMeeting], "both clients receive the exact same meeting transition");

  host.send(Buffer.from([0x13, 0xFF]));
  await delay(120);
  assert.equal(hostPackets.some(packet => packet[0] === 0x1B), false,
    "a second emergency request cannot start another meeting while already in a meeting");
  console.log("PASS: two authenticated clients create/join/start a room, cross the real asset-ready barrier, and receive the same server-authoritative emergency meeting");
} catch (error) {
  failure = error;
} finally {
  host.close();
  guest.close();
  await Promise.all([once(host, "close").catch(() => {}), once(guest, "close").catch(() => {})]);
  await new Promise<void>(resolve => wss.close(() => resolve()));
  await new Promise<void>(resolve => server.close(() => resolve()));
  // callMeeting owns real discussion/voting timers; this isolated test process
  // exits after sockets and servers are closed instead of waiting for the timer.
}
if (failure) {
  console.error(failure);
  process.exit(1);
}
process.exit(0);
