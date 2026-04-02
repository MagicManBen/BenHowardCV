SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1
pkill -f "python.*app.py" 2>/dev/null
source .venv/bin/activate
mkdir -p data/runtime
python app.py > data/runtime/server.log 2>&1 &
SERVER_PID=$!
for _ in {1..40}; do
    if curl -sSf http://127.0.0.1:5050 >/dev/null 2>&1; then
        break
    fi
    sleep 0.25
done
open "http://127.0.0.1:5050"
wait "$SERVER_PID"
