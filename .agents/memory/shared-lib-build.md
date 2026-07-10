---
name: Shared lib build requirement
description: lib/shared is a composite TypeScript project whose .d.ts declarations must be built before dependent artifacts can typecheck.
---

# Shared lib (`@workspace/shared`) — build requirement

## Rule

After any change to `lib/shared/src/*.ts`, run:

```
npx tsc --build lib/shared
```

before running `pnpm run typecheck` on `api-server` or `telegram-game`. Without the `.d.ts` files in `lib/shared/dist/`, those artifacts fail with:

> error TS6305: Output file '…/lib/shared/dist/xxx.d.ts' has not been built from source file '…'

**Why:** Both artifacts use TypeScript project references (`"references": [{"path": "../../lib/shared"}]`). Project references require compiled declaration outputs; they don't look up raw TS source directly.

## How to apply

- After editing `coords.ts`, `collisionMap.ts`, `collisionData.ts`, or `index.ts` in `lib/shared/src/`, always rebuild before typechecking.
- Vite (telegram-game dev server) resolves TS source directly and does NOT need the build step at runtime — only `tsc --noEmit` typechecking does.

## Exports note

`lib/shared/src/index.ts` uses explicit named re-exports (not `export *`) because both `coords.ts` and `collisionMap.ts` export `MAP_W` and `MAP_H`. Wildcard re-export causes TS2308 ambiguity. Always keep named exports in index.ts.
