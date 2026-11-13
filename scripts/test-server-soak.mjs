import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const WebSocket = require('ws');
const port = Number(process.env.PORT ?? 8081);
const wsUrl = process.env.WS_URL ?? `ws://127.0.0.1:${port}/api/ws`;
const durationMs = Number(process.env.SOAK_DURATION_MS ?? 20 * 60 * 1000);
const apiPid = Number(process.env.API_PID);
const healthUrl = `http://127.0.0.1:${port}/api/healthz`;
const startedAt = Date.now();
const deadline = startedAt + durationMs;
const stats = { durationMs, gameplaySuites: [], websocketCycles: 0, authenticatedSockets: 0, healthProbes: 0, healthLatencyMs: [], rssKiB: [] };
let stopped = false;
let monitorError = null;

async function readRssKiB() {
  if (!Number.isInteger(apiPid) || apiPid <= 0) throw new Error('API_PID must identify the local API process');
  try { process.kill(apiPid, 0); } catch { throw new Error('API process exited during soak'); }
  const status = await readFile(`/proc/${apiPid}/status`, 'utf8');
  const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
  if (!match) throw new Error('Unable to read API resident memory from /proc');
  return Number(match[1]);
}

async function probeHealth() {
  const before = Date.now();
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
  const latency = Date.now() - before;
  assert.equal(response.status, 200, `health endpoint returned ${response.status}`);
  const payload = await response.json();
  assert.equal(payload.status, 'ok', 'health endpoint payload must remain healthy');
  stats.healthProbes++;
  stats.healthLatencyMs.push(latency);
  stats.rssKiB.push(await readRssKiB());
  if (Math.max(...stats.rssKiB) > 1024 * 1024) throw new Error('API RSS exceeded 1 GiB during soak');
}

async function runGameplaySuite(file) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], {
      cwd: process.cwd(),
      env: { ...process.env, WS_URL: wsUrl },
      stdio: 'inherit',
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${file} exceeded the 180s soak-suite timeout`));
    }, 180_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${file} failed (exit=${code}, signal=${signal})`));
    });
  });
  stats.gameplaySuites.push(file);
  await probeHealth();
}

function connectAndAuthenticate(id, username) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'nodebuffer';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.terminate();
      reject(new Error(`WebSocket auth timed out for ${username}`));
    }, 5000);
    socket.once('open', () => socket.send(JSON.stringify({ id, username })));
    socket.on('message', data => {
      const packet = Buffer.from(data);
      if (packet[0] !== 0x01 || settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function closeSockets(sockets) {
  await Promise.all(sockets.map(socket => new Promise(resolve => {
    if (socket.readyState === WebSocket.CLOSED) return resolve();
    const timer = setTimeout(() => { socket.terminate(); resolve(); }, 2000);
    socket.once('close', () => { clearTimeout(timer); resolve(); });
    if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'soak cycle complete');
    else socket.terminate();
  })));
}

async function monitor() {
  while (!stopped) {
    try { await probeHealth(); }
    catch (error) { monitorError = error; return; }
    await sleep(10_000);
  }
}

try {
  await probeHealth();
  const monitorTask = monitor();

  // Re-run the real multi-client flows once before the long connection churn.
  for (const file of [
    'test_sabotage.mjs',
    'test_report_body.mjs',
    'test_reconnect_ws.mjs',
    'test_solo_bot_discussion.mjs',
  ]) {
    await runGameplaySuite(file);
    if (monitorError) throw monitorError;
  }

  // Keep four authenticated clients cycling throughout the remaining soak.
  // Existing gameplay suites cover lobby semantics; this phase stresses
  // handshake, close, health, event-loop and process-memory stability.
  let cycle = 0;
  while (Date.now() < deadline) {
    if (monitorError) throw monitorError;
    const base = 700_000 + cycle * 4;
    const sockets = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        connectAndAuthenticate(base + index, `Soak${cycle}P${index}`),
      ),
    );
    stats.authenticatedSockets += sockets.length;
    await sleep(1500);
    await closeSockets(sockets);
    stats.websocketCycles++;
    await probeHealth();
    cycle++;
    await sleep(Math.min(8000, Math.max(0, deadline - Date.now())));
  }

  stopped = true;
  await monitorTask;
  if (monitorError) throw monitorError;
  const initialRss = stats.rssKiB[0] ?? 0;
  const finalRss = stats.rssKiB.at(-1) ?? 0;
  const maxRss = Math.max(...stats.rssKiB);
  const sortedLatency = [...stats.healthLatencyMs].sort((a, b) => a - b);
  const p95 = sortedLatency[Math.min(sortedLatency.length - 1, Math.floor(sortedLatency.length * 0.95))] ?? 0;
  if (finalRss - initialRss > 512 * 1024) {
    throw new Error(`API RSS grew by ${finalRss - initialRss} KiB (over 512 MiB budget)`);
  }
  console.log('[server-soak] PASS', JSON.stringify({
    ...stats,
    elapsedMs: Date.now() - startedAt,
    initialRssKiB: initialRss,
    finalRssKiB: finalRss,
    maxRssKiB: maxRss,
    healthP95Ms: p95,
  }));
} catch (error) {
  stopped = true;
  console.error('[server-soak] FAIL', error);
  process.exitCode = 1;
}
