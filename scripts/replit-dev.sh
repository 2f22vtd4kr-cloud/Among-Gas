#!/usr/bin/env bash
set -euo pipefail

# Replit exposes Vite as the public web process; the API runs privately on 8080.
# Vite proxies HTTP API calls and WebSocket upgrades to that process.
setsid env PORT=8080 pnpm --filter @workspace/api-server run dev &
api_pid=$!
vite_pid=
kill_tree() {
  local pid="$1" child
  local children
  # Each service is launched with setsid, so terminate its entire process group
  # (pnpm, shell wrappers, Node, Vite, and esbuild) instead of orphaning children.
  if kill -TERM -- "-$pid" 2>/dev/null; then return 0; fi
  if [ -r "/proc/$pid/task/$pid/children" ]; then
    children="$(cat "/proc/$pid/task/$pid/children" 2>/dev/null || true)"
  else
    children="$(ps -o pid= --ppid "$pid" 2>/dev/null || true)"
  fi
  for child in $children; do kill_tree "$child"; done
  kill -TERM "$pid" 2>/dev/null || true
}
cleanup() {
  trap - EXIT INT TERM
  if [ -n "$vite_pid" ]; then kill_tree "$vite_pid"; fi
  kill_tree "$api_pid"
  wait "$api_pid" 2>/dev/null || true
  if [ -n "$vite_pid" ]; then wait "$vite_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

ready=0
for attempt in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8080/api/healthz >/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$api_pid" 2>/dev/null; then wait "$api_pid"; exit 1; fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "API did not become healthy on port 8080" >&2
  exit 1
fi

export PORT=5173
export BASE_PATH=/
unset VITE_WS_URL
setsid pnpm --filter @workspace/telegram-game run dev &
vite_pid=$!
wait "$vite_pid"
