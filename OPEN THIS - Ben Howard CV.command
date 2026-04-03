#!/bin/zsh

set -euo pipefail

cd "$(dirname "$0")"

find_free_port() {
  local port="$1"
  while lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; do
    port=$((port + 1))
  done
  print -r -- "${port}"
}

PORT="$(find_free_port 8000)"
BASE_URL="http://127.0.0.1:${PORT}"
PUBLIC_URL="${BASE_URL}/"
ADMIN_URL="${BASE_URL}/local-admin/jobspy.html"
LOG_FILE="/tmp/benhowardcv-http.log"

python3 local_server.py "${PORT}" >"${LOG_FILE}" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "${SERVER_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

for _ in {1..50}; do
  if curl -fsS "${BASE_URL}/api/status" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    print -u2 -- "Ben Howard CV server failed to start. Check ${LOG_FILE}."
    exit 1
  fi
  sleep 0.1
done

print -r -- "Ben Howard CV running at ${BASE_URL}"
open "${ADMIN_URL}"

wait "${SERVER_PID}"
