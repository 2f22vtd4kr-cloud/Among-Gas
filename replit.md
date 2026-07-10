# Telegram Game Project

A multi-artifact project centered on a Telegram game with a top-down map, backed by a shared Express API server, plus a mockup sandbox for UI prototyping.

## ⚠️ Agent rule — read this first

**At the start of every session, read `handoff.md` before doing anything else.** It is the running log of everything that has been built, every decision made, and where the project was left off. After completing any meaningful work, append a new dated entry to `handoff.md` following the format defined at the top of that file, then commit it with the rest of your changes.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._
- If a fresh import/re-import shows no configured workflows and `listArtifacts()` returns empty even though `artifacts/*/.replit-artifact/artifact.toml` files exist, the artifact registration metadata was dropped on import. Repair by re-running `verifyAndReplaceArtifactToml()` against each artifact's own (unmodified) `artifact.toml` — this re-registers the artifact and its workflows without touching any source code.
- **Screenshot / visual QA harness:** the telegram-game frontend always lands on the lobby's "Create Room" screen when screenshotted normally, because the real flow requires a live WebSocket round-trip through several server states. Use `?mock=<key>` (dev-only, gated on `import.meta.env.DEV`, zero prod effect) to force any visual state instead:
  - `connecting`, `error`, `lobby-empty`, `lobby-host`, `lobby-guest` — navigate to `/?mock=<key>`
  - `playing`, `reveal-crewmate`, `reveal-impostor`, `report-ready`, `meeting-discussion`, `meeting-voting`, `meeting-result`, `gameover-crew`, `gameover-impostor` — navigate to `/game?mock=<key>` (role-reveal overlays are held open indefinitely under mock, instead of auto-dismissing after 3.2s, so they can be reliably screenshotted)
  - Implemented in `GameContext.tsx` (`MOCK_PRESETS`, skips the real socket) and `GameMap.tsx` (`isMockReveal`, disables the CSS fade-out). Add new presets to `MOCK_PRESETS` as new screens/phases are built.
  - Any preset that needs a UI element gated on proximity to the local player (e.g. the Report button) must place the relevant remote entity relative to `PLAYER_SPAWN` (from `game/player.ts`), not the shared `MOCK_REMOTE_POSITIONS` constant — that constant is map-center-anchored, which is far from where the local player's physics state actually spawns.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `SINGLE_PLAY.md` — full scope doc for the single-player mode, bot AI, and headless playtest simulation feature (read before starting any bot/AI work)
- `GAME_SPEC.md` — game mechanics specification and phase completion checklist
