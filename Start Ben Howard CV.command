#!/bin/zsh

set -e

cd "$(dirname "$0")"

PORT=8000
PUBLIC_URL="http://localhost:${PORT}/"
ADMIN_URL="http://localhost:${PORT}/local-admin/"

if lsof -ti tcp:${PORT} >/dev/null 2>&1; then
  open "${PUBLIC_URL}"
  open "${ADMIN_URL}"
  exit 0
fi

python3 -m http.server "${PORT}" >/tmp/benhowardcv-http.log 2>&1 &
SERVER_PID=$!

sleep 1
open "${PUBLIC_URL}"
open "${ADMIN_URL}"

wait "${SERVER_PID}"
