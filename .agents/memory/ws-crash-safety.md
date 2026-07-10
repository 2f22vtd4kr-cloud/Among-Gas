---
name: WebSocket server crash-safety pattern
description: How to prevent a single malformed/oversized client packet from crashing a raw `ws` WebSocketServer for all connections, not just per-field bounds checks.
---

# WebSocket Server Crash-Safety

Per-opcode length/range checks (e.g. `if (raw.length !== 5) return;`) are necessary but not sufficient to make a raw `ws`-based binary protocol server crash-safe. Three separate guardrails are needed together:

1. **`maxPayload` on the `WebSocketServer` constructor.** Without it, a client can send an arbitrarily large frame; cap it near the largest legitimate message (e.g. 4KB for a small binary protocol) so oversized frames are rejected at the socket layer before touching app code.
2. **try/catch around the entire `message` event handler body**, closing only the offending connection on error. Any uncaught exception thrown synchronously inside a `ws.on('message', ...)` callback propagates as an unhandled exception and can crash the whole Node process — taking down every other active connection/lobby with it, not just the bad client.
3. **try/catch around any `setTimeout`/`setInterval` callback that calls `ws.send()`/`ws.close()`**, guarded by a `readyState === OPEN` check. These run outside the message handler's try/catch, so a race where the socket closes just before the timer fires (e.g. a handshake-timeout callback) is a separate, easy-to-miss crash vector.

**Why:** A concrete example: usernames written into a packet with a `UInt8` length prefix (`buf.writeUInt8(username.length, ...)`) throw a `RangeError` for any username > 255 bytes. If an auth path trusts client-supplied data for the username (e.g. a dev-mode bypass that parses raw client JSON), an oversized username is trivial to send and — without the try/catch — crashes the process for every lobby, not just that client.

**How to apply:** When reviewing or building a raw `ws` server, check for all three guardrails specifically, not just field-level validation. Verify with live attack scripts (oversized payload, oversized string fields, connect-then-immediately-disconnect races) rather than assuming code review alone caught every throw path — the async-timer race is easy to miss even on a careful pass.
