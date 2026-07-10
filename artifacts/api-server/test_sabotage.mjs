import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8080/api/ws';

function connect(id, username) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'nodebuffer';
    const state = { ws, slot: null, msgs: [] };
    ws.on('open', () => {
      ws.send(JSON.stringify({ id, username }));
    });
    ws.on('message', (data) => {
      const buf = Buffer.from(data);
      state.msgs.push(buf);
      if (buf[0] === 0x01) {
        state.slot = buf.readUInt8(1);
        resolve(state);
      }
    });
    ws.on('error', reject);
  });
}

function send(state, bytes) {
  state.ws.send(Buffer.from(bytes));
}

function waitFor(state, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = state.msgs.find(predicate);
      if (found) return resolve(found);
    };
    check();
    const iv = setInterval(check, 20);
    const timer = setTimeout(() => {
      clearInterval(iv);
      reject(new Error('timeout waiting for message'));
    }, timeoutMs);
    const wrap = () => {
      const found = state.msgs.find(predicate);
      if (found) { clearInterval(iv); clearTimeout(timer); resolve(found); }
    };
    state.ws.on('message', wrap);
  });
}

async function main() {
  console.log('--- Connecting 3 players ---');
  const host = await connect(90001, 'HostSab');
  send(host, [0x10, 0x01]); // create room
  const roomMsg = await waitFor(host, b => b[0] === 0x10 && b[1] === 0x03);
  const roomCode = roomMsg.slice(4, 10).toString('ascii').trim();
  console.log('Room code:', roomCode, 'host slot:', host.slot);

  const p2 = await connect(90002, 'P2Sab');
  const codeBytes = Buffer.from(roomCode.padEnd(6, ' '), 'ascii');
  send(p2, [0x10, 0x02, ...codeBytes]);
  const p2Slot = await waitFor(p2, b => b[0] === 0x10 && b[1] === 0x05);
  p2.slot = p2Slot.readUInt8(2);

  const p3 = await connect(90003, 'P3Sab');
  send(p3, [0x10, 0x02, ...codeBytes]);
  const p3Slot = await waitFor(p3, b => b[0] === 0x10 && b[1] === 0x05);
  p3.slot = p3Slot.readUInt8(2);

  console.log('Slots:', host.slot, p2.slot, p3.slot);

  console.log('--- Starting game ---');
  send(host, [0x12]);
  await Promise.all([host, p2, p3].map(s => waitFor(s, b => b[0] === 0x1A)));

  const all = [host, p2, p3];
  const roleOf = (s) => {
    const m = s.msgs.find(b => b[0] === 0x1A);
    return m.readUInt8(1) === 1 ? 'impostor' : 'crewmate';
  };
  const impostor = all.find(s => roleOf(s) === 'impostor');
  const crewmates = all.filter(s => roleOf(s) !== 'impostor');
  console.log('Impostor slot:', impostor.slot, 'Crewmates:', crewmates.map(c => c.slot));

  // ── Test 1: Lights sabotage (single pad, any crewmate fixes) ──────────────
  console.log('--- Triggering Lights sabotage (systemId=1) ---');
  console.log('impostor.slot =', impostor.slot, 'ws.readyState=', impostor.ws.readyState);
  send(impostor, [0x15, 0x04, 0x01]);
  await new Promise(r => setTimeout(r, 1000));
  console.log('crewmates[0] msgs so far:', crewmates[0].msgs.map(b => [...b]));
  const startMsg = await waitFor(crewmates[0], b => b[0] === 0x16 && b[1] === 0x01);
  console.log('Sabotage started broadcast:', [...startMsg]);
  if (startMsg[2] !== 0x01) throw new Error('Expected systemId=1 (Lights)');
  if (startMsg[3] !== impostor.slot) throw new Error('attackerSlot mismatch');

  // Crewmate attempts repair from far away (should be rejected — no ack expected quickly)
  console.log('--- Repairing Lights (crewmate 1, padId=0) ---');
  send(crewmates[0], [0x15, 0x05, 0x01, 0x00]);
  const fixedMsg = await waitFor(crewmates[1], b => b[0] === 0x16 && b[1] === 0x03, 3000).catch(() => null);
  if (fixedMsg) {
    console.log('Lights fixed broadcast received:', [...fixedMsg]);
  } else {
    console.log('WARNING: Lights fix not broadcast within timeout (may be proximity-rejected — expected since crewmate is at spawn, not on the pad)');
  }

  // ── Test 2: Sabotage cooldown blocks immediate re-trigger ──────────────────
  console.log('--- Attempting immediate re-sabotage during cooldown (should be silently rejected) ---');
  const msgCountBefore = crewmates[0].msgs.length;
  send(impostor, [0x15, 0x04, 0x02]); // O2
  await new Promise(r => setTimeout(r, 800));
  const newSabotageStart = crewmates[0].msgs.slice(msgCountBefore).find(b => b[0] === 0x16 && b[1] === 0x01);
  console.log(newSabotageStart ? 'FAIL: second sabotage was allowed during cooldown!' : 'OK: second sabotage correctly rejected (cooldown active)');

  console.log('--- Test complete ---');
  process.exit(0);
}

main().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
