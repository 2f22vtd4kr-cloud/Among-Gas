#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_INDEX="$ROOT_DIR/lib/db/src/schema/index.ts"

# The current game server is intentionally in-memory and the Drizzle schema
# is empty. Do not make every Replit merge depend on a provisioned Postgres DB
# until real tables are exported from the schema index.
if [[ ! -f "$SCHEMA_INDEX" ]] || ! grep -Eq '^[[:space:]]*export[[:space:]]+\*[[:space:]]+from' "$SCHEMA_INDEX"; then
  echo "No Drizzle schema exports detected; skipping database push."
  exit 0
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required when Drizzle schema exports exist." >&2
  exit 1
fi

cd "$ROOT_DIR"
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
