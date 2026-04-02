#!/bin/bash
# Helper script for legacy Chrome cookie capture flow.

SUPABASE_URL="https://jntpyqguonknixyksqbp.supabase.co"
SUPABASE_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpudHB5cWd1b25rbml4eWtzcWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODYxNTEsImV4cCI6MjA5MDY2MjE1MX0.Tx2nMTKuguGIRnSwLR2Wm47d68p99DrH2ldIWWKOuBs"
SAVE_FN="$SUPABASE_URL/functions/v1/save-cookies"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}   Indeed Cookie Capture + Scraper${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}[1/4]${NC} Opening Chrome to Indeed..."

CURRENT_URL=$(osascript -e 'tell application "Google Chrome"
  if (count of windows) > 0 then
    return URL of active tab of front window
  end if
  return ""
end tell' 2>/dev/null)

if [[ "$CURRENT_URL" == *"indeed.com"* ]]; then
  echo -e "  ${GREEN}OK${NC} Chrome already on Indeed"
else
  osascript -e 'tell application "Google Chrome"
    activate
    if (count of windows) = 0 then
      make new window
    end if
    set URL of active tab of front window to "https://uk.indeed.com/"
  end tell' 2>/dev/null
  echo -e "  ${GREEN}OK${NC} Opened uk.indeed.com in Chrome"
fi

echo ""
echo -e "${YELLOW}[2/4]${NC} Make sure you are logged in to Indeed."
echo -e "  If already logged in, press ${GREEN}Enter${NC}."
echo -e "  If not, log in first, then press ${GREEN}Enter${NC}."
echo ""
read -p "  Press Enter when ready... "

echo ""
echo -e "${YELLOW}[3/4]${NC} Grabbing cookies from Chrome..."

CURRENT_URL=$(osascript -e 'tell application "Google Chrome" to return URL of active tab of front window' 2>/dev/null)
if [[ "$CURRENT_URL" != *"indeed.com"* ]]; then
  echo -e "  ${RED}ERROR${NC} Active tab is not on Indeed ($CURRENT_URL)"
  read -p "  Press Enter to exit... "
  exit 1
fi

COOKIES=$(osascript -e 'tell application "Google Chrome" to execute front window'"'"'s active tab javascript "document.cookie"' 2>&1)

if [[ "$COOKIES" == *"error"* ]] || [[ "$COOKIES" == *"Executing JavaScript"* ]]; then
  echo -e "  ${RED}ERROR${NC} AppleScript JS disabled."
  echo -e "  Fix: Chrome > View > Developer > Allow JavaScript from Apple Events"
  read -p "  Press Enter to exit... "
  exit 1
fi

COOKIE_LEN=${#COOKIES}
if [[ $COOKIE_LEN -lt 20 ]]; then
  echo -e "  ${RED}ERROR${NC} Cookie string too short ($COOKIE_LEN chars)"
  read -p "  Press Enter to exit... "
  exit 1
fi

echo -e "  ${GREEN}OK${NC} Got cookies (${COOKIE_LEN} chars)"

COOKIES_JSON=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$COOKIES")
RESPONSE=$(curl -s -X POST "$SAVE_FN" \
  -H "Content-Type: application/json" \
  -d "{\"source\":\"indeed\",\"cookies\":$COOKIES_JSON}" 2>&1)

if echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if d.get('ok') else 1)" 2>/dev/null; then
  echo -e "  ${GREEN}OK${NC} Cookies saved to Supabase"
else
  echo -e "  ${RED}ERROR${NC} Cookie save failed: $RESPONSE"
  read -p "  Press Enter to exit... "
  exit 1
fi

echo ""
echo -e "${YELLOW}[4/4]${NC} Scraping Indeed via Chrome..."
echo -e "  Search config is set on ${CYAN}checkloops.co.uk/local-admin/indeed.html${NC}"

python3 "$PROJECT_ROOT/local-admin/indeed-browser-scraper.py"
SCRAPE_EXIT=$?

echo ""
echo -e "${CYAN}===============================================${NC}"
if [[ $SCRAPE_EXIT -eq 0 ]]; then
  echo -e "  ${GREEN}OK${NC} Done. Jobs uploaded to Supabase."
else
  echo -e "  ${YELLOW}WARN${NC} Scraping finished with warnings."
fi
echo -e "  View results: ${CYAN}https://checkloops.co.uk/local-admin/indeed.html${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""
read -p "  Press Enter to close... "
