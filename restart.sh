#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

API_PORT="${RAPHAEL_API_PORT:-1034}"
WEB_PORT="${VITE_PORT:-5173}"
LOG_DIR="$ROOT_DIR/.logs"

kill_port_process() {
  local port="$1"
  local pids
  pids="$(lsof -ti "tcp:${port}" || true)"
  if [[ -n "$pids" ]]; then
    echo "Stopping process on port ${port}: ${pids}"
    kill $pids || true
    sleep 1
    local remain
    remain="$(lsof -ti "tcp:${port}" || true)"
    if [[ -n "$remain" ]]; then
      echo "Force stopping process on port ${port}: ${remain}"
      kill -9 $remain || true
    fi
  fi
}

mkdir -p "$LOG_DIR"

echo "==> Restarting Raphael Publish services"
kill_port_process "$API_PORT"
kill_port_process "$WEB_PORT"

echo "==> Starting API on :${API_PORT}"
nohup pnpm api >"$LOG_DIR/api.log" 2>&1 &
API_PID=$!

echo "==> Starting Web on :${WEB_PORT}"
nohup pnpm dev -- --host 0.0.0.0 --port "$WEB_PORT" >"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!

sleep 2

if ! kill -0 "$API_PID" 2>/dev/null; then
  echo "API failed to start. Check: $LOG_DIR/api.log"
  exit 1
fi

if ! kill -0 "$WEB_PID" 2>/dev/null; then
  echo "Web failed to start. Check: $LOG_DIR/web.log"
  exit 1
fi

echo "==> Restart completed"
echo "API: http://localhost:${API_PORT}"
echo "Web: http://localhost:${WEB_PORT}"
echo "Logs:"
echo "  $LOG_DIR/api.log"
echo "  $LOG_DIR/web.log"
