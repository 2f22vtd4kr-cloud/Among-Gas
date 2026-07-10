# Among Us Telegram Mini App — Master Technical Specification

> **Single source of truth.** Every implementation session must read this file before writing code.
> Last updated: 2026-07-10
>
> **Context note:** This spec was written *after* a 2D map, sprite renderer, collision system, and local
> player movement were already built. Those systems are in `artifacts/telegram-game/src/`. The
> sections below describe how the multiplayer layer slots on top of what already exists.

---

## Table of Contents

1. [Current State of the Codebase](#1-current-state-of-the-codebase)
2. [Target Architecture](#2-target-architecture)
3. [Network Layer — WebSocket Binary Protocol](#3-network-layer--websocket-binary-protocol)
4. [Coordinate Wire Format (Critical Fix)](#4-coordinate-wire-format-critical-fix)
5. [Authentication — Telegram Handshake](#5-authentication--telegram-handshake)
6. [Lobby & Matchmaking Lifecycle](#6-lobby--matchmaking-lifecycle)
7. [Authoritative Sync Engine — Delta Compression](#7-authoritative-sync-engine--delta-compression)
8. [Role Assignment & Information Asymmetry](#8-role-assignment--information-asymmetry)
9. [Kill Mechanics](#9-kill-mechanics)
10. [Tasks, Sabotages & RPC Sub-opcodes](#10-tasks-sabotages--rpc-sub-opcodes)
11. [Canvas Rendering Layers](#11-canvas-rendering-layers)
12. [Telegram Mini App Integration](#12-telegram-mini-app-integration)
13. [Implementation Roadmap](#13-implementation-roadmap)
14. [Known Problems Fixed vs. Raw Specs](#14-known-problems-fixed-vs-raw-specs)

---

## 1. Current State of the Codebase

### What is already built
| System | Location | Status |
|---|---|---|
| 2D map renderer (4956×2856px) | `artifacts/telegram-game/src/pages/GameMap.tsx` | ✅ Done |
| Pixel-accurate collision map (RLE) | `artifacts/telegram-game/src/game/collisionData.ts` + `collisionMap.ts` | ✅ Done |
| Local player movement (WASD + joystick) | `artifacts/telegram-game/src/game/player.ts` + `components/Joystick.tsx` | ✅ Done |
| Sprite animation (9 poses, 3 characters) | `artifacts/telegram-game/src/game/characterSprites.ts` | ✅ Done |
| Canvas shadow / blur rendering | `GameMap.tsx` | ✅ Done |
| Collision editor (dev tool) | `artifacts/telegram-game/src/pages/CollisionEditor.tsx` | ✅ Done |
| Express API server | `artifacts/api-server/src/` | ✅ Bare (healthz only) |
| PostgreSQL + Drizzle ORM setup | `lib/db/` | ✅ Schema empty |
| OpenAPI spec + codegen pipeline | `lib/api-spec/` | ✅ Healthz only |

### What is NOT yet built
- WebSocket server (no real-time at all)
- Telegram SDK integration
- Multiplayer: lobbies, player slots, delta sync
- Roles, kill mechanics, tasks, sabotages
- Vision / fog-of-war system

---

## 2. Target Architecture

```
Telegram Mini App (WebView)
  └── React + Canvas game (artifacts/telegram-game)
        ├── Renders map, sprites, UI overlays
        ├── Reads local input (WASD / virtual joystick)
        ├── Sends binary WebSocket frames to server
        └── Applies server delta updates to remote players

Node.js Express server (artifacts/api-server)
  ├── HTTP: REST endpoints (/api/*)
  └── WebSocket: ws library upgraded from same HTTP server
        ├── Telegram HMAC auth on connect
        ├── LobbyManager (in-memory)
        ├── Authoritative position store + collision validation
        └── Delta broadcast loop at 25Hz
```

**Key constraint:** The WebSocket server MUST share the same HTTP server as Express, not run
on a separate port. Our Express server owns port 8080 (assigned by artifact config). The `ws`
library's `{ server: httpServer }` option handles this upgrade path correctly.

---

## 3. Network Layer — WebSocket Binary Protocol

### Transport rules
- Binary only: `socket.binaryType = 'arraybuffer'` on client; `Buffer` on server.
- No application-level ACKs (TCP guarantees delivery and ordering).
- All multi-byte integers: **Little-Endian**.
- No raw UDP. Telegram WebView has no `dgram` access.

### Opcode matrix

| Opcode | Name | Direction | Size | Payload |
|---|---|---|---|---|
| `0x00` | Handshake Fail | S→C | 1 byte | None. Server closes socket immediately. |
| `0x01` | Handshake OK | S→C | 2 bytes | Byte 1: assigned player slot (0–14). |
| `0x10` | Lobby Control | Both | Variable | Byte 1: sub-action (see §6). |
| `0x11` | Move Intent | C→S | 5 bytes | Bytes 1–2: X (NormInt16LE). Bytes 3–4: Y (NormInt16LE). |
| `0x12` | Game Start | C→S | 1 byte | Host only. Triggers role shuffle. |
| `0x13` | Report / Emergency | C→S | 2 bytes | Byte 1: body slot ID (0xFF = emergency button). |
| `0x14` | Vote | C→S | 2 bytes | Byte 1: target slot ID (0xFF = skip). |
| `0x15` | RPC Event | Both | Variable | Byte 1: sub-opcode (see §10). |
| `0x1A` | Role Reveal | S→C | 2 bytes | Byte 1: role (0=crewmate, 1=impostor). Impostor also gets teammate list (see §8). |
| `0x1B` | Meeting Start | S→C | 3 bytes | Byte 1: reporter slot. Byte 2: body slot (0xFF = emergency). |
| `0x1C` | Vote Result / Eject | S→C | 3 bytes | Byte 1: ejected slot. Byte 2: win flag. |
| `0xFF` | Delta Sync | S→C | Variable | Byte 1: count of moving players. Sub-blocks: slot(1) + X(2) + Y(2). |

### Server-side: Buffer only, no DataView
```typescript
// CORRECT on Node.js:
const opcode = rawFrame.readUint8(0);
const x = rawFrame.readInt16LE(1);

// WRONG on Node.js (pooled buffer bug):
const view = new DataView(rawFrame.buffer); // .buffer may reference shared pool memory
```

### Client-side: DataView on ArrayBuffer
```typescript
// CORRECT on browser:
const view = new DataView(event.data);
const opcode = view.getUint8(0);
const x = view.getInt16(1, true); // true = little-endian
```

---

## 4. Coordinate Wire Format (Critical Fix)

### Problem with the raw spec
The original spec encodes coordinates as `Math.round(x * 100)` packed into Int16LE.
Int16 range: –32,768 to +32,767.
Our map is **4956×2856 pixels**. At ×100 scale: 495,600 — overflows Int16 catastrophically.

### Solution: Normalize to 0–32000 range

Use a **normalized coordinate system** on the wire:

```
wireX = Math.round((pixelX / MAP_W) * 32000)   // 0..32000
wireY = Math.round((pixelY / MAP_H) * 32000)   // 0..32000
```

Decode on receiver:
```
pixelX = (wireX / 32000) * MAP_W
pixelY = (wireY / 32000) * MAP_H
```

- 32000 fits safely in Int16 (max 32767), leaving headroom.
- Resolution: 4956 / 32000 ≈ 0.155 px/unit — sub-pixel precision, more than enough.

### Constants (define once, import everywhere)
```typescript
// lib/shared/coords.ts  (new shared package)
export const WIRE_SCALE = 32000;
export const MAP_W = 4956;
export const MAP_H = 2856;

export function toWire(px: number, mapDim: number): number {
  return Math.round((px / mapDim) * WIRE_SCALE);
}
export function fromWire(wire: number, mapDim: number): number {
  return (wire / WIRE_SCALE) * mapDim;
}
```

### Delta threshold (recalibrated)
The raw spec used `dx² + dy² > 0.005` for normalized 0–1 coords.
In our 0–32000 wire space, an equivalent 0.5px movement threshold:
```
wireThreshold = (0.5 / MAP_W) * 32000 ≈ 3.2
→ use: dx² + dy² > 10   (≈ 3.16 wire units = ~0.5px on map)
```

---

## 5. Authentication — Telegram Handshake

### Production flow
1. Client connects: `wss://domain?initData=<encoded>` (from `window.Telegram.WebApp.initData`).
2. First message from client after connection: the raw `initData` string as UTF-8.
3. Server performs HMAC-SHA256 validation (see below).
4. On success: assign slot, send `0x01` + slotId.
5. On failure: send `0x00`, close immediately.

### HMAC validation (corrected implementation)
```typescript
import { createHmac } from 'crypto';

function verifyTelegramAuth(initData: string, botToken: string): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const entries: string[] = [];
    params.forEach((val, key) => entries.push(`${key}=${val}`));
    entries.sort();

    // Telegram key derivation: HMAC-SHA256("WebAppData", botToken)
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computed = createHmac('sha256', secretKey).update(entries.join('\n')).digest('hex');

    if (computed !== hash) return null;

    const user = params.get('user');
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}
```

### Development fallback
When `TELEGRAM_BOT_TOKEN` env var is absent or equals `"DEBUG_MOCK_TOKEN"`, bypass HMAC and
accept any first message that parses as JSON with a numeric `id` field. This allows local
Replit preview to work without a real Telegram context.

```typescript
const DEV_MODE = !process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'DEBUG_MOCK_TOKEN';

// In dev mode, client sends: JSON.stringify({ id: 12345, username: "TestUser" })
```

### Required secret
`TELEGRAM_BOT_TOKEN` — stored as a Replit Secret, never hardcoded.

---

## 6. Lobby & Matchmaking Lifecycle

### State machine
```
  [Connect + Auth]
        │
        ▼
  LOBBY (WAITING)  ◄──── JOIN (0x10 sub 0x02)
        │
        │  Host sends 0x12
        ▼
  SPAWN  (brief; server sends spawn positions, role reveals)
        │
        ▼
  ROAMING  ◄───────── normal gameplay
        │
        ├── Meeting called (0x13) ──► DISCUSSION ──► VOTING ──► EJECTION ──► ROAMING
        │
        └── Win condition met ──► GAMEOVER ──► TEARDOWN
```

### Room codes
- 6 characters, uppercase alphanumeric.
- Excluded (ambiguous on mobile): `I`, `O`, `0`, `1`.
- Alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- Collision resolution: regenerate until unique.

### Lobby Control opcode 0x10 sub-actions

| Byte 1 | Direction | Description |
|---|---|---|
| `0x01` | C→S | Create room |
| `0x02` | C→S | Join room (Bytes 2–7: ASCII room code) |
| `0x03` | S→C | Room update broadcast (player count, host slot, username list) |
| `0x04` | S→C | Join error (Byte 2: error code: 0x01=not found, 0x02=in progress, 0x03=full) |

**Note on raw spec opcode collision:** The raw spec reused opcode `0x01` (Handshake Success)
as the response to CREATE/JOIN. This spec uses `0x10 sub 0x03` for room updates and a
dedicated `0x10 sub 0x04` for join errors, keeping `0x01` exclusively for the auth handshake.

### LobbyManager (implementation reference)
The `LobbyManager` class from Module 3 is the canonical implementation. Key properties:
- `lobbies: Map<string, Lobby>` — keyed by room code.
- `userToLobbyMap: Map<number, string>` — Telegram user ID → room code (for disconnect cleanup).
- Host migration: on host disconnect in WAITING state, promote lowest slot ID remaining.
- In ACTIVE state: disconnected player slot is tombstoned (kept for reconnect window). If
  player does not reconnect within 60s, slot is freed and the game may continue.

### Player capacity
Maximum 15 players per lobby (slots 0–14). Host always occupies slot 0.

---

## 7. Authoritative Sync Engine — Delta Compression

### Design
- Server ticks at **25Hz** (every 40ms via `setInterval`).
- Each tick: for each ROAMING lobby, compare each player's current position against their
  `lastBroadcastX/Y`.
- Only players whose movement exceeds the wire threshold are included in the broadcast.
- All moving players in a lobby are batched into one single `0xFF` frame per tick.

### 0xFF packet layout
```
Byte 0:    0xFF (opcode)
Byte 1:    N  (number of moving players, Uint8)
[× N]:
  Byte 0:  player slot ID (Uint8, 0–14)
  Byte 1–2: X (Int16LE, wire-normalized 0–32000)
  Byte 3–4: Y (Int16LE, wire-normalized 0–32000)

Total size: 2 + N×5 bytes
```

### Wire threshold (calibrated for our coordinate space)
```typescript
const dx = player.wireX - player.lastBroadcastX;
const dy = player.wireY - player.lastBroadcastY;
if (dx * dx + dy * dy > 10) {  // ≈ 0.5px movement on map
  // include in delta packet
}
```

### Client-side prediction
The client runs its own local movement + collision resolution every frame (already built in
`player.ts`). It does NOT wait for server confirmation to move. Server corrections are applied
when the received position differs from local by more than a snap threshold (TBD: ~5 wire
units ≈ ~0.8px).

This gives latency-free movement feel while keeping server authoritative.

### Position update flow
```
Client frame:
  1. stepPlayer() → new local position
  2. sendMove(wireX, wireY)  [throttled: max 1 per 40ms to match server tick]
  3. Render local player at local position immediately

Server on 0x11:
  1. Validate: player alive, lobby ROAMING
  2. Validate against collision map (collisionMap.ts imported server-side)
  3. If valid: update player.x/y
  4. If invalid (wall clip): correct to last valid position (send correction via 0xFF)

Server delta tick (40ms):
  1. Collect all moved players
  2. Broadcast 0xFF to all in lobby

Client on 0xFF:
  1. Update remote players' positions
  2. Snap-correct own position if server disagrees
```

---

## 8. Role Assignment & Information Asymmetry

### Server-side only (opcode 0x12 triggers this)
```typescript
function assignRoles(lobby: Lobby, impostorCount: number): void {
  const ids = Array.from(lobby.players.keys());
  // Fisher-Yates shuffle
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  ids.forEach((id, i) => {
    const p = lobby.players.get(id)!;
    p.role = i < impostorCount ? 'impostor' : 'crewmate';
    p.alive = true;
  });
}
```

### Impostor count by player count
| Players | Impostors |
|---|---|
| 1–6 | 1 |
| 7–9 | 1 or 2 (host setting) |
| 10–15 | 2 or 3 (host setting) |

### Role reveal packet (0x1A)
```
Crewmate packet:
  [0x1A, 0x00]

Impostor packet:
  [0x1A, 0x01, impostorCount, slot_0, slot_1, ...]
```
Server sends each player their own personalized packet. **Never broadcast full role array.**

### Information asymmetry rules
- Crewmates: see all players as generic crewmates in the client state.
- Impostors: know the identity of other impostors (highlighted in red on their client).
- Server NEVER sends role data for other players in a crewmate's packet.
- The client must never accept role claims from other clients — only from the server's 0x1A packet.

---

## 9. Kill Mechanics

### Packet flow
```
Impostor client ──[0x15 sub 0x01, victimSlot]──► Server validates ──► broadcasts [0x15 sub 0x01, victimSlot]
```

### Server-side validation
```typescript
function validateKill(attacker: Player, victim: Player, maxKillRangeWire: number): boolean {
  if (!attacker.alive || attacker.role !== 'impostor') return false;
  if (!victim.alive || victim.role === 'impostor') return false; // no team kill
  if (attacker.killCooldownMs > 0) return false;

  const dx = attacker.wireX - victim.wireX;
  const dy = attacker.wireY - victim.wireY;
  return (dx * dx + dy * dy) <= maxKillRangeWire * maxKillRangeWire;
}
```

`maxKillRangeWire`: calibrate to ~1.5 map tiles. With wire scale 32000 and MAP_W 4956, one
tile ≈ 10px ≈ 65 wire units. Kill range ≈ 1.5 tiles → 97 wire units.

### Kill cooldown
- Default: 25 seconds.
- Tracked server-side (`killCooldownMs` decremented each server tick).
- Host can configure before game start (15s / 25s / 45s).

### After kill broadcast
All players in lobby receive `[0x15, 0x01, victimSlot]`.
- Client: victim's sprite switches to "ghost" (dead body asset on map).
- Victim themselves enters ghost mode: can walk through walls, cannot interact, cannot vote
  (can see chat during meetings).
- Impostor kill cooldown resets.

---

## 10. Tasks, Sabotages & RPC Sub-opcodes

### RPC opcode 0x15 sub-codes

| Sub | Name | Sender | Payload | Server Validation |
|---|---|---|---|---|
| `0x01` | Kill | Impostor | Byte 2: victim slot | Alive impostor + cooldown + distance |
| `0x02` | Vent toggle | Impostor | Byte 2: vent ID | Proximity + vent exists on map |
| `0x03` | Task step | Crewmate | Byte 2: task ID. Byte 3: step index | Player assigned this task + correct step order |
| `0x04` | Sabotage | Impostor | Byte 2: system ID | Global sabotage cooldown |
| `0x05` | Repair | Crewmate | Byte 2: system ID. Byte 3: pad (0/1) | Proximity to repair console |

### Sabotage state machine
```
[Normal] ──► Impostor sends 0x15 sub 0x04 ──► [SABOTAGE ACTIVE]
                                                     │ 30s countdown
                                              ┌──────┴──────┐
                                         [Fixed]        [Countdown = 0]
                                              │                │
                                        [Normal]         [Impostors Win]
```

### Sabotage system IDs
| ID | System | Fix condition |
|---|---|---|
| `0x01` | Lights | Any crewmate interacts with electrical panel |
| `0x02` | O₂ | Two crewmates interact with two separate pads |
| `0x03` | Reactor | Two crewmates hold two separate pads simultaneously |

**Meeting block:** When any sabotage is active, server rejects all 0x13 (report/emergency) frames.
Players must fix the sabotage first.

**Lights effect:** Reduce `crewmateVisionRadius` server constant to 15% of normal.
Impostor vision unaffected. Server broadcasts vision change to all clients via dedicated update.

### Task tracking
- Tasks assigned per crewmate at game start (server-side, not client-chosen).
- Progress tracked as step bitmask per player per task on server.
- Global task bar = (total completed steps) / (total steps across all crewmates).
- Broadcast format: `[0x15, 0x03, Math.round(ratio * 100)]` — 3 bytes total.
- Crewmate win: task bar reaches 100%.

---

## 11. Canvas Rendering Layers

Our existing canvas is a single 2D context. For the multiplayer game, we formalize four logical
layers rendered in order each frame:

| Layer | Contents | Implementation |
|---|---|---|
| Layer 0 (Background) | Map image + tile grid | Already built in `GameMap.tsx` |
| Layer 1 (Entities) | Remote player sprites, ghost sprites, dead bodies | New: render from server delta state |
| Layer 2 (Lightmask) | Fog-of-war circle; filled black outside vision radius | New: raycasted or simple radial clip |
| Layer 3 (UI) | Joystick, task screen, vote modal, kill button, sabotage alerts | Joystick done; rest are new React overlays |

Layers 0 and 1 are drawn on the main canvas. The lightmask (Layer 2) uses canvas composite
operations (`destination-in` / `source-over`) on the same canvas or a separate overlay canvas.
Layer 3 is React DOM overlaid via absolute positioning over the canvas.

---

## 12. Telegram Mini App Integration

### SDK target
`@telegram-apps/sdk-react` — provides `useLaunchParams`, `useInitData`, haptics, theme.

### Connection setup (client)
```typescript
import { useLaunchParams } from '@telegram-apps/sdk-react';

function useGameSocket() {
  const { initDataRaw } = useLaunchParams();
  const socketUrl = `wss://${window.location.host}/ws?initData=${encodeURIComponent(initDataRaw ?? '')}`;
  // connect...
}
```

Development fallback (no Telegram context):
```typescript
const initDataRaw = window.Telegram?.WebApp?.initDataUnsafe
  ? window.Telegram.WebApp.initData
  : JSON.stringify({ id: Date.now(), username: 'DevPlayer' }); // dev mock
```

### Haptics
```typescript
// Kill / meeting:
window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
// Task complete:
window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
// Button tap:
window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
```

### Theme
Read `window.Telegram.WebApp.themeParams` and map to CSS variables at app init. The game
should respect the Telegram color scheme (dark/light).

---

## 13. Implementation Roadmap

Ordered by dependency. Each step is independently shippable and testable.

### Phase 1 — WebSocket Foundation
1. Add `ws` package to `artifacts/api-server`.
2. Upgrade existing Express HTTP server to accept WebSocket connections (no new port).
3. Implement auth gateway (HMAC in prod, JSON mock in dev).
4. Send 0x01 handshake success with slot ID.
5. Confirm connection in browser console (dev mode).

### Phase 2 — Lobby & Matchmaking
1. Add `LobbyManager` class to `artifacts/api-server/src/lobby.ts`.
2. Wire 0x10 opcode handler (create / join / room-update broadcast).
3. Build lobby screen UI in React (create room, enter room code, player list).
4. Test with two browser tabs: both see each other's usernames in lobby.

### Phase 3 — Real-time Movement
1. Extract coordinate normalization to `lib/shared/coords.ts`.
2. Client: send 0x11 on every `stepPlayer()` (throttled to 25Hz).
3. Server: receive 0x11, validate against `collisionMap.ts`, update player position.
4. Delta broadcast loop (25Hz, 0xFF packets).
5. Client: render remote players from delta state (simple colored circles first, sprites later).
6. Test: two tabs, see each other move.

### Phase 4 — Game Start & Roles
1. Game Start button (host-only) → 0x12.
2. Server: Fisher-Yates role assignment → personalized 0x1A to each player.
3. Client: role reveal screen (brief animation, then game starts).
4. SPAWN → ROAMING state transition with spawn positions.

### Phase 5 — Kill Mechanics
1. Kill button (impostor only, proximity-gated UI).
2. 0x15 sub 0x01 client → server → broadcast.
3. Ghost mode rendering (dead players walk through walls, translucent).
4. Kill cooldown timer UI.

### Phase 6 — Meetings & Voting
1. Report body (0x13) / Emergency button.
2. Meeting overlay (discussion timer → voting UI).
3. Vote packets (0x14) + server tally → 0x1C eject result.
4. Eject animation + return to ROAMING.

### Phase 7 — Tasks
1. Task assignment at game start.
2. Task minigame UIs (simple interactions per task type).
3. 0x15 sub 0x03 step progression + server global progress broadcast.
4. Task progress bar in HUD.

### Phase 8 — Sabotages & Vision
1. Impostor sabotage panel.
2. Sabotage state machine server-side.
3. Lights: fog-of-war lightmask Layer 2 implementation.
4. O₂ / Reactor: dual-pad fix UI.

### Phase 9 — Polish & Telegram Integration
1. `@telegram-apps/sdk-react` SDK.
2. Real `initData` auth in production.
3. Haptic feedback hooks.
4. Telegram theme color binding.

---

## 14. Known Problems Fixed vs. Raw Specs

This section documents issues in the source spec documents that are corrected in this master spec.

| # | Raw Spec Issue | Fix Applied |
|---|---|---|
| 1 | `x * 100` packed as Int16LE overflows for our 4956px map | Wire normalize to 0–32000 range (§4) |
| 2 | Standalone `WebSocketServer({ port: 8080 })` conflicts with Express on 8080 | Upgrade from same HTTP server via `{ server: httpServer }` option |
| 3 | Opcode `0x01` (Handshake OK) reused inside CREATE lobby handler | Lobby responses use `0x10 sub 0x03/0x04`; `0x01` reserved for auth only |
| 4 | `new DataView(data.buffer)` on Node.js Buffer has pooled memory bug | Server uses Buffer methods only (`readUint8`, `readInt16LE`); DataView on client only |
| 5 | Delta threshold `dx²+dy² > 0.005` calibrated for normalized 0–1 coords | Recalibrated to `> 10` in wire-space (≈ 0.5px on map) |
| 6 | Movement accepted in `LOBBY` state (spec server.ts bug) | Only accepted in `ROAMING` state; spawn positions sent at phase transition |
| 7 | `spec server.ts` has no dev-mode bypass for Telegram auth | DEV_MODE flag: accepts raw JSON `{ id, username }` when no real bot token |
| 8 | Kill range `maxKillRange` given in normalized coords | Recalibrated to wire units: ~97 units ≈ 1.5 map tiles (§9) |
| 9 | No mention of client-side prediction | Explicit: client moves locally, server corrects; avoids waiting for server RTT |
| 10 | Spec's "HTML5 client.js" describes a blank canvas | Our existing React/Canvas engine replaces it; canvas layers formalized in §11 |
| 11 | No spec for `EJECTION` → vision spec during meetings | Meeting block: camera zooms to table, movement disabled, voting UI shown |
| 12 | `handleGameStart` stub — no actual role shuffle | Full role assignment with information asymmetry in §8 |
