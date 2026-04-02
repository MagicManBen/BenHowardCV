#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# Capture Indeed Cookies → Supabase → Run Scraper
# ─────────────────────────────────────────────────────────────────
# Double-click this in Finder to:
#   1. Open Chrome to Indeed (if not already there)
#   2. Grab cookies via AppleScript JS
#   3. Send them to Supabase
#   4. Optionally run the local scraper
#
# ONE-TIME SETUP: In Chrome, go to View > Developer >
#   "Allow JavaScript from Apple Events" (tick it).
# ─────────────────────────────────────────────────────────────────

SUPABASE_URL="https://jntpyqguonknixyksqbp.supabase.co"
SUPABASE_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpudHB5cWd1b25rbml4eWtzcWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwODYxNTEsImV4cCI6MjA5MDY2MjE1MX0.Tx2nMTKuguGIRnSwLR2Wm47d68p99DrH2ldIWWKOuBs"
SAVE_FN="$SUPABASE_URL/functions/v1/save-cookies"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Indeed Cookie Capture + Scraper${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Open Chrome to Indeed ─────────────────────────────────
echo -e "${YELLOW}[1/4]${NC} Opening Chrome to Indeed..."

# Check if Chrome already has Indeed open
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
echo -e "${YELLOW}[2/4]${NC} Make sure you're logged in to Indeed."
echo -e "  If you're already logged in, just press ${GREEN}Enter${NC}."
echo -e "  If not, log in first, then press ${GREEN}Enter${NC}."
echo ""
read -p "  Press Enter when ready... "

# ── Step 3: Grab cookies via AppleScript ──────────────────────────
echo ""
echo -e "${YELLOW}[3/4]${NC} Grabbing cookies from Chrome..."

# Make sure we're on an indeed.com page
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
  echo -e "  ${YELLOW}To fix (one-time):${NC}"
  echo -e "  1. In Chrome's menu bar: ${CYAN}View → Developer → Allow JavaScript from Apple Events${NC}"
  echo -e "  2. Then run this script again."
  echo ""
  echo -e "  ${YELLOW}OR:${NC} Use the Tampermonkey userscript instead."
  echo -e "  The script at local-admin/indeed-cookie-capture.user.js will"
  echo -e "  automatically capture cookies when you visit Indeed."
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

# ── Step 4: Send to Supabase ─────────────────────────────────────
echo -e "${YELLOW}[4/4]${NC} Saving to Supabase..."

# Escape the cookie string for JSON
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

# ── Verify ────────────────────────────────────────────────────────
echo ""
VERIFY=$(curl -s "$SUPABASE_URL/rest/v1/cookies?source=eq.indeed&select=updated_at" \
  -H "apikey: $SUPABASE_ANON" 2>&1)
echo -e "  ${GREEN}✓${NC} Verified in Supabase: $VERIFY"

# ── Offer to run scraper ─────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "  Cookies captured! Ready to scrape Indeed."
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "  Run scraper now? (default: yes)"
echo -e "  Options: ${GREEN}y${NC}=scrape with defaults, ${GREEN}n${NC}=exit, or type custom args"
echo ""
read -p "  [Y/n/custom args]: " SCRAPE_CHOICE

if [[ "$SCRAPE_CHOICE" == "n" ]] || [[ "$SCRAPE_CHOICE" == "N" ]]; then
  echo -e "\n  ${GREEN}Done!${NC} Run the scraper later with:"
  echo -e "  ${CYAN}cd local-admin && python3 scrape-indeed-local.py${NC}"
  echo ""
  read -p "  Press Enter to close... "
  exit 0
fi

echo ""
echo -e "${YELLOW}Running scraper...${NC}"
echo ""

cd "$SCRIPT_DIR/local-admin" || cd "$(dirname "$0")/local-admin"

if [[ -z "$SCRAPE_CHOICE" ]] || [[ "$SCRAPE_CHOICE" == "y" ]] || [[ "$SCRAPE_CHOICE" == "Y" ]]; then
  python3 scrape-indeed-local.py
else
  python3 scrape-indeed-local.py $SCRAPE_CHOICE
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}   Done! Check results at:${NC}"
echo -e "${GREEN}   https://checkloops.co.uk/local-admin/indeed.html${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo ""
read -p "Press Enter to close... "
