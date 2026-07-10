// Disposable diagnostic script — simulates a real solo client (continuous
// movement + emergency button) to try to reproduce the reported "screen
// shaking" bug by watching the 0xFF position-correction echoes for
// oscillation. Deleted after use; see test_sabotage.mjs for the pattern.
import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8080/api/ws';
const MAP_W = 3224, MAP_H = 1858;
const WIRE_SCALE = 32000;
const SPEED_PX_PER_SEC = Math.round(130 * Math.sqrt((MAP_W / 1040) * (MAP_H / 580)));
const toWire = (px, dim) => Math.round((px / dim) * WIRE_SCALE);
const fromWire = (w, dim) => (w / WIRE_SCALE) * dim;

function connect(id, username) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'nodebuffer';
    const state = { ws, slot: null, msgs: [], lastCorrection: null, corrections: [] };
    ws.on('open', () => ws.send(JSON.stringify({ id, username })));
    ws.on('message', (data) => {
      const buf = Buffer.from(data);
      state.msgs.push(buf);
      if (buf[0] === 0x01 && state.slot === null) {
        state.slot = buf.readUInt8(1);
        resolve(state);
      }
      if (buf[0] === 0xFF) {
        const count = buf.readUInt8(1);
        let off = 2;
        for (let i = 0; i < count; i++) {
          const slot = buf.readUInt8(off); off += 1;
          const wx = buf.readInt16LE(off); off += 2;
          const wy = buf.readInt16LE(off); off += 2;
          if (slot === state.slot) {
            const x = fromWire(wx, MAP_W);
            const y = fromWire(wy, MAP_H);
            state.corrections.push({ t: Date.now(), x, y });
            state.lastCorrection = { x, y };
          }
        }
      }
    });
    ws.on('error', reject);
  });
}

function send(state, bytes) { state.ws.send(Buffer.from(bytes)); }

function waitFor(state, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = state.msgs.find(predicate);
      if (found) return resolve(found);
    };
    check();
    const timer = setTimeout(() => { state.ws.off('message', wrap); reject(new Error('timeout')); }, timeoutMs);
    const wrap = () => { const f = state.msgs.find(predicate); if (f) { clearTimeout(timer); state.ws.off('message', wrap); resolve(f); } };
    state.ws.on('message', wrap);
  });
}

async function main() {
  console.log('--- Solo shake repro: connecting 1 player ---');
  const host = await connect(95001, 'ShakeBot');
  send(host, [0x10, 0x01]); // create room
  const roomMsg = await waitFor(host, b => b[0] === 0x10 && b[1] === 0x03);
  const roomCode = roomMsg.slice(4, 10).toString('ascii').trim();
  console.log('Room:', roomCode, 'slot:', host.slot);

  console.log('--- Starting solo game ---');
  send(host, [0x12]);
  const reveal = await waitFor(host, b => b[0] === 0x1A);
  const role = reveal.readUInt8(1) === 1 ? 'impostor' : 'crewmate';
  console.log('Role:', role, '(expect crewmate for solo)');

  // Simulate holding "right" (dx=1) for 4 seconds like a real client's rAF
  // loop: local pos advances every ~16ms tick, sent at 25Hz (every 40ms),
  // starting from the spawn point used by the client (PLAYER_SPAWN).
  const SPAWN_X = Math.round(350 * (MAP_W / 1040));
  const SPAWN_Y = Math.round(150 * (MAP_H / 580));
  let px = SPAWN_X, py = SPAWN_Y;
  let lastSendWireX = -1, lastSendWireY = -1;
  const startTs = Date.now();
  let lastTick = startTs;

  console.log('--- Simulating 4s of continuous rightward movement ---');
  await new Promise((resolve) => {
    const iv = setInterval(() => {
      const now = Date.now();
      const dtMs = Math.min(now - lastTick, 48);
      lastTick = now;
      const dist = (SPEED_PX_PER_SEC * dtMs) / 1000;
      px = Math.min(MAP_W, px + dist); // ignore collision — just push right
      const wx = toWire(px, MAP_W), wy = toWire(py, MAP_H);
      if (wx !== lastSendWireX || wy !== lastSendWireY) {
        send(host, [0x11, wx & 0xff, (wx >> 8) & 0xff, wy & 0xff, (wy >> 8) & 0xff]);
        lastSendWireX = wx; lastSendWireY = wy;
      }
      if (now - startTs > 1500 && now - startTs < 1550) {
        console.log('--- Pressing Emergency button mid-movement ---');
        send(host, [0x13, 0xFF]);
      }
      if (now - startTs > 4000) { clearInterval(iv); resolve(); }
    }, 16);
  });

  await new Promise((r) => setTimeout(r, 300)); // let final 0xFF land

  console.log(`--- Collected ${host.corrections.length} position echoes for our own slot ---`);
  // Check for oscillation: any correction that jumps backward by more than
  // a few px right after a forward jump (would visually read as "shaking").
  let maxBackJump = 0;
  for (let i = 1; i < host.corrections.length; i++) {
    const dx = host.corrections[i].x - host.corrections[i - 1].x;
    if (dx < -2) maxBackJump = Math.min(maxBackJump, dx);
  }
  console.log('Max backward jump in echoed X (should be ~0, tiny negative = quantization noise):', maxBackJump);
  console.log('First 5 echoes:', host.corrections.slice(0, 5));
  console.log('Last 5 echoes:', host.corrections.slice(-5));

  // Did an emergency meeting incorrectly start solo? (regression check)
  const meetingStart = host.msgs.find(b => b[0] === 0x1B);
  console.log(meetingStart ? 'FAIL: meeting started solo!' : 'OK: solo emergency meeting correctly rejected');

  console.log('--- Done ---');
  process.exit(0);
}

main().catch((err) => { console.error('TEST FAILED:', err); process.exit(1); });
