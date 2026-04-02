#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# Capture Indeed Cookies → Supabase
# ─────────────────────────────────────────────────────────────────
# Double-click in Finder to:
#   1. Open Chrome to Indeed (if not already there)
#   2. Grab cookies via AppleScript JS
#   3. Send to Supabase
#   4. Open Indeed search so Tampermonkey can scrape results
#
# ONE-TIME SETUP: In Chrome, go to View > Developer >
#   "Allow JavaScript from Apple Events" (tick it).
# ─────────────────────────────────────────────────────────────────

SUPABASE_URL="https://jntpyqguonknixyksqbp.supabase.co"
SUPABASE_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpudHB5cWd1b25rbml4eWtzcWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODYxNTEsImV4cCI6MjA5MDY2MjE1MX0.Tx2nMTKuguGIRnSwLR2Wm47d68p99DrH2ldIWWKOuBs"
SAVE_FN="$SUPABASE_URL/functions/v1/save-cookies"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Indeed Cookie Capture${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Open Chrome to Indeed ─────────────────────────────────
echo -e "${YELLOW}[1/3]${NC} Opening Chrome to Indeed..."

CURRENT_URL=$(osascript -e 'tell application "Google Chrome"
  if (count of windows) > 0 then
    return URL of active tab of front window
  end if
  return ""
end tell' 2>/dev/null)

if [[ "$CURRENT_URL" == *"indeed.com"* ]]; then
  echo -e "  ${GREEN}✓${NC} Chrome already on Indeed"
else
  osascript -e 'tell application "Google Chrome"
    activate
    if (count of windows) = 0 then
      make new window
    end if
    set URL of active tab of front window to "https://uk.indeed.com/"
  end tell' 2>/dev/null
  echo -e "  ${GREEN}✓${NC} Opened uk.indeed.com in Chrome"
fi

# ── Step 2: Wait for user to be logged in ─────────────────────────
echo ""
echo -e "${YELLOW}[2/3]${NC} Make sure you're logged in to Indeed."
echo -e "  If you're already logged in, just press ${GREEN}Enter${NC}."
echo -e "  If not, log in first, then press ${GREEN}Enter${NC}."
echo ""
read -p "  Press Enter when ready... "

# ── Step 3: Grab cookies + send to Supabase ──────────────────────
echo ""
echo -e "${YELLOW}[3/3]${NC} Grabbing cookies from Chrome..."

CURRENT_URL=$(osascript -e 'tell application "Google Chrome" to return URL of active tab of front window' 2>/dev/null)
if [[ "$CURRENT_URL" != *"indeed.com"* ]]; then
  echo -e "  ${RED}✗${NC} Active tab is not on Indeed ($CURRENT_URL)"
  echo -e "  Please switch to your Indeed tab and try again."
  read -p "  Press Enter to exit... "
  exit 1
fi

COOKIES=$(osascript -e 'tell application "Google Chrome" to execute front window'\''s active tab javascript "document.cookie"' 2>&1)

if [[ "$COOKIES" == *"error"* ]] || [[ "$COOKIES" == *"Executing JavaScript through AppleScript is turned off"* ]]; then
  echo -e "  ${RED}✗${NC} Can't grab cookies — AppleScript JS is disabled."
  echo ""
  echo -e "  ${YELLOW}Fix (one-time):${NC} Chrome menu → ${CYAN}View → Developer → Allow JavaScript from Apple Events${NC}"
  echo ""
  read -p "  Press Enter to exit... "
  exit 1
fi

COOKIE_LEN=${#COOKIES}
if [[ $COOKIE_LEN -lt 20 ]]; then
  echo -e "  ${RED}✗${NC} Cookie string too short ($COOKIE_LEN chars) — you may not be logged in."
  read -p "  Press Enter to exit... "
  exit 1
fi

echo -e "  ${GREEN}✓${NC} Got cookies (${COOKIE_LEN} chars)"

COOKIES_JSON=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$COOKIES")

RESPONSE=$(curl -s -X POST "$SAVE_FN" \
  -H "Content-Type: application/json" \
  -d "{\"source\":\"indeed\",\"cookies\":$COOKIES_JSON}" 2>&1)

if echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if d.get('ok') else 1)" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} Cookies saved to Supabase!"
else
  echo -e "  ${RED}✗${NC} Failed: $RESPONSE"
  read -p "  Press Enter to exit... "
  exit 1
fi

VERIFY=$(curl -s "$SUPABASE_URL/rest/v1/cookies?source=eq.indeed&select=updated_at" \
  -H "apikey: $SUPABASE_ANON" 2>&1)
echo -e "  ${GREEN}✓${NC} Verified: $VERIFY"

# ── Open Indeed search (Tampermonkey will auto-scrape) ────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}✓ Cookies saved!${NC}"
echo ""
echo -e "  Now opening Indeed search in Chrome."
echo -e "  Tampermonkey will auto-scrape results → Supabase."
echo -e "  Look for the green notification in Chrome."
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"

SEARCH_URL="https://uk.indeed.com/jobs?q=Practice+Manager+OR+operations+manager+OR+continuous+improvement&l=Staffordshire&radius=50&fromage=7&sort=date"

osascript -e "tell application \"Google Chrome\"
  activate
  set URL of active tab of front window to \"$SEARCH_URL\"
end tell" 2>/dev/null

echo ""
echo -e "  Search opened in Chrome. Tampermonkey handles the rest."
echo -e "  Check ${CYAN}https://checkloops.co.uk/local-admin/indeed.html${NC} for results."
echo ""
read -p "  Press Enter to close... "
