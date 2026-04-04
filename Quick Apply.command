#!/bin/zsh
# Double-click this to open Terminal and run quick-apply
set -euo pipefail
cd "$(dirname "$0")"

printf '\033[1m\n  ╔══════════════════════════════════╗\n  ║     Quick Apply — Ben Howard     ║\n  ╚══════════════════════════════════╝\033[0m\n\n'

# Start server if not running
if ! curl -sf http://localhost:8000/api/status > /dev/null 2>&1; then
  echo "Starting local server…"
  python3 local_server.py &
  SERVER_PID=$!
  sleep 2
  if ! curl -sf http://localhost:8000/api/status > /dev/null 2>&1; then
    echo "❌ Server failed to start"; exit 1
  fi
  echo "✓ Server started"
fi

printf '\033[1mPaste the job advert URL:\033[0m '
read -r URL

if [[ -z "$URL" ]]; then
  echo "❌ No URL provided"; exit 1
fi

./quick-apply.sh "$URL"

echo
printf '\033[1mPress Enter to close…\033[0m'
read -r
