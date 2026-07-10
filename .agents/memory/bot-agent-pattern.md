---
name: Bot agent circular import pattern
description: How to structure server-side bot agents without circular ESM imports, and how to run bot-related tests.
---

## The circular import problem

`BotAgent.ts` needs `Lobby`, `LobbyPlayer`, `LobbyManager` from `lobby.ts`.
`lobby.ts` needs the bot agent type so `LobbyPlayer.botAgent` can be typed.

**Solution:** define a minimal `IBotAgent` interface directly in `lobby.ts`:
```ts
export interface IBotAgent {
  tick(lobby: Lobby, self: LobbyPlayer, manager: LobbyManager): void;
}
```
`LobbyPlayer.botAgent?: IBotAgent` — `lobby.ts` never imports from `bot/`.
`BotAgent.ts` imports from `lobby.ts` (one-way). No runtime circular dependency.

**Why:** ESM circular imports work at runtime as long as no exported value is read at module-init time. But TypeScript's `type`-only imports are erased entirely, and the concrete usage (calling `agent.tick()`) happens inside method bodies, not at module load time. However, using the interface pattern is cleaner and avoids any ambiguity.

## NullWebSocket sentinel

Bot slots need a `WebSocket`-shaped object that broadcast guards skip:
```ts
const nullWs = { readyState: 3 as const, send: (_data: unknown) => {} } as unknown as WebSocket;
```
`readyState=3` (CLOSED) means every `player.ws.readyState === 1` check in broadcast helpers naturally skips bot slots. Zero special-casing required in existing broadcast methods.

## Testing bot/shared logic in scripts package

The `scripts` package does not include `@workspace/shared` by default.
When writing test scripts that import shared lib code, add it first:
```json
"dependencies": { "@workspace/shared": "workspace:*" }
```
Then run `pnpm install` before executing with `tsx`.

## Bot tick architecture

- 5Hz `_botInterval` (200ms) in `LobbyManager`, started alongside the 25Hz `_deltaInterval`.
- Bot `tick()` mutates `player.x`/`player.y` directly → 25Hz delta loop broadcasts changes automatically.
- Error isolation: each bot tick wrapped in try/catch so a single agent crash can't kill the interval.
- Bot speed: 80px per 200ms tick = 400px/s. Cross-map (~3224px) in ~8s.

## applyKill / applyTaskStep / applyRepair pattern

Both `wsServer.ts` and bot agents need to: validate action + broadcast + check win.
These are now convenience methods on `LobbyManager`. Both callers use them.
If you add a new action type, add a corresponding `apply*` method to keep this DRY.
