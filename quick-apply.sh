#!/bin/bash
# ────────────────────────────────────────────────────────────────
# quick-apply.sh — Paste a job advert, get a published CV + PDF
#
# Usage:
#   ./quick-apply.sh                           # prompts for URL or text
#   ./quick-apply.sh https://example.com/job   # fetches advert from URL
#   ./quick-apply.sh advert.txt                # reads from file
#   pbpaste | ./quick-apply.sh -               # reads from clipboard/stdin
#
# Requires: local server on localhost:8000, jq, python3
# ────────────────────────────────────────────────────────────────
set -euo pipefail

# Auto-detect server port (OPEN THIS starts on first free port from 8000)
detect_server() {
  for p in 8000 8001 8002 8003 8004 8005; do
    if curl -sf "http://127.0.0.1:$p/api/status" > /dev/null 2>&1; then
      echo "http://127.0.0.1:$p"
      return 0
    fi
  done
  return 1
}

SERVER="${QUICK_APPLY_SERVER:-$(detect_server || echo "")}"
[ -z "$SERVER" ] && { printf '\033[0;31m✗\033[0m Server not found on ports 8000-8005. Start with: OPEN THIS - Ben Howard CV.command\n' >&2; exit 1; }
APPLIED_DIR="$HOME/Desktop/Applied Jobs CVs"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { printf "${CYAN}▸${NC} %s\n" "$*"; }
ok()    { printf "${GREEN}✓${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}⚠${NC} %s\n" "$*"; }
fail()  { printf "${RED}✗${NC} %s\n" "$*" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || fail "jq is required. Install with: brew install jq"

info "Using server at $SERVER"

# ── Fetch text from URL ──
fetch_url() {
  python3 -c "
import sys, re
from urllib.request import Request, urlopen

url = sys.argv[1]
req = Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'})
html = urlopen(req, timeout=20).read().decode('utf-8', errors='replace')

# strip script/style blocks then tags
html = re.sub(r'<(script|style|noscript)[^>]*>.*?</\1>', '', html, flags=re.DOTALL|re.IGNORECASE)
text = re.sub(r'<[^>]+>', ' ', html)
# collapse whitespace
text = re.sub(r'[ \t]+', ' ', text)
text = re.sub(r'\n{3,}', '\n\n', text).strip()
print(text[:15000])
" "$1"
}

# ── Get advert text ──
if [ "${1:-}" = "-" ]; then
  info "Reading advert from stdin…"
  ADVERT=$(cat)
elif [[ "${1:-}" =~ ^https?:// ]]; then
  info "Fetching advert from URL: $1"
  ADVERT=$(fetch_url "$1") || fail "Could not fetch URL: $1"
elif [ -n "${1:-}" ] && [ -f "$1" ]; then
  info "Reading advert from file: $1"
  ADVERT=$(cat "$1")
else
  printf "${BOLD}Paste a job advert URL (or raw text then Ctrl-D):${NC} "
  read -r FIRST_LINE
  if [[ "$FIRST_LINE" =~ ^https?:// ]]; then
    info "Fetching advert from URL: $FIRST_LINE"
    ADVERT=$(fetch_url "$FIRST_LINE") || fail "Could not fetch URL: $FIRST_LINE"
  else
    printf "\n${BOLD}Paste the rest of the advert text, then press Ctrl-D:${NC}\n"
    REST=$(cat)
    ADVERT="${FIRST_LINE}${REST:+$'\n'$REST}"
  fi
fi

[ -z "$ADVERT" ] && fail "No advert text provided."

ADVERT_PREVIEW=$(echo "$ADVERT" | head -c 120 | tr '\n' ' ')
info "Advert: ${ADVERT_PREVIEW}…"
echo

# ── Step 1: Generate ──
info "Generating tailored CV via OpenAI…"
GEN_RESP=$(curl -sf "$SERVER/api/generate" \
  -X POST -H "Content-Type: application/json" \
  -d "$(jq -n --arg text "$ADVERT" '{advertText: $text}')" \
  --max-time 120) || fail "Generate request failed."

GEN_ERROR=$(echo "$GEN_RESP" | jq -r '.meta.error // .error // empty')
[ -n "$GEN_ERROR" ] && fail "Generation failed: $GEN_ERROR"

COMPANY=$(echo "$GEN_RESP" | jq -r '.application.companyName // "Unknown"')
ROLE=$(echo "$GEN_RESP" | jq -r '.application.roleTitle // "Unknown"')
COST=$(echo "$GEN_RESP" | jq -r '.meta.estimated_cost_usd // "?"')
ok "Generated: $COMPANY — $ROLE  (cost: \$$COST)"

# ── Step 2: Publish ──
info "Publishing to GitHub + Supabase…"
PUB_PAYLOAD=$(echo "$GEN_RESP" | jq '{
  application: (
    .application + {
      personalisedContent: (.generatedContent // {}),
      generatedContent: (.generatedContent // {}),
      personalisedIntro: (.generatedContent // {}).personalisedOpening,
      whyThisRole: (.generatedContent // {}).whyThisRole,
      shortCompanyReason: (.application.shortCompanyReason // (.generatedContent // {}).whyThisCompany),
      closingSummary: (.generatedContent // {}).closingSummary,
      genHeroPositioning: (.generatedContent // {}).heroPositioning,
      genPersonalisedOpening: (.generatedContent // {}).personalisedOpening,
      genWhyThisCompany: (.generatedContent // {}).whyThisCompany,
      genWhyThisRole: (.generatedContent // {}).whyThisRole,
      genFitSummary: (.generatedContent // {}).fitSummary,
      genLikelyContribution: (.generatedContent // {}).likelyContributionSummary,
      genCultureFit: (.generatedContent // {}).cultureFitSummary,
      genClosingSummary: (.generatedContent // {}).closingSummary,
      genRoleNeedsSummary: (.generatedContent // {}).roleNeedsSummary,
      genCompanyHighlights: ((.generatedContent // {}).companyHighlights // []),
      genEvidenceExamples: ((.generatedContent // {}).selectedEvidenceExamples // []),
      genExperienceMappings: ((.generatedContent // {}).experienceMappings // []),
      genFocusAreasToBring: ((.generatedContent // {}).focusAreasToBring // []),
      genFirst90DaysPlan: ((.generatedContent // {}).first90DaysPlan // []),
      genClosingProofPoints: ((.generatedContent // {}).closingProofPoints // [])
    }
  )
}')

PUB_RESP=$(curl -sf "$SERVER/api/publish" \
  -X POST -H "Content-Type: application/json" \
  -d "$PUB_PAYLOAD" --max-time 60) || fail "Publish request failed."

PUB_ERROR=$(echo "$PUB_RESP" | jq -r '.error // empty')
[ -n "$PUB_ERROR" ] && warn "Publish warning: $PUB_ERROR"

FULL_URL=$(echo "$PUB_RESP" | jq -r '.fullUrl // empty')
SHORT_CODE=$(echo "$PUB_RESP" | jq -r '.application.shortCode // empty')
GITHUB_OK=$(echo "$PUB_RESP" | jq -r '.publishedToGitHub // false')
SUPABASE_OK=$(echo "$PUB_RESP" | jq -r '.publishedToSupabase // false')
ok "Published — GitHub: $GITHUB_OK, Supabase: $SUPABASE_OK"

# ── Step 3: Generate PDF ──
info "Generating PDF…"
PDF_FILENAME="Ben Howard CV - $ROLE"

python3 - "$SERVER" "$COMPANY" "$SHORT_CODE" "$FULL_URL" "$PDF_FILENAME" << 'PYEOF'
import json, sys, re
from urllib.request import Request, urlopen

server, company, short_code, full_url, filename = sys.argv[1:6]

html = urlopen(f"{server}/BH%20CV.html", timeout=10).read().decode("utf-8")

if short_code:
    short_display = "checkloops.co.uk/j/#" + short_code
    qr_label = f'I have prepared a personalised CV for {company}.<br>Scan QR or visit <strong style="letter-spacing:0.02em;">{short_display}</strong>'
else:
    qr_label = f"I have prepared a personalised CV for {company}. Scan or tap to view."

qr_block = f'''<section class="sidebar-card" style="margin-top:auto; padding-top:0.6rem; border-top:1px solid rgba(255,255,255,0.14); display:flex; flex-direction:column; align-items:center; text-align:center;">
<h2 style="margin:0;">Tailored CV</h2>
<p style="margin-top:0.3rem; font-size:0.58rem; line-height:1.35; color:rgba(245,245,241,0.88);">{qr_label}</p>
</section>'''

html = html.replace("</aside>", qr_block + "\n</aside>")

if company:
    rt_match = re.search(r'class="role-title".*?</p>', html, re.DOTALL)
    if rt_match:
        end = rt_match.end()
        prepared = f'\n<p class="role-title" style="font-size:0.54rem; margin-top:0.12rem; letter-spacing:0.18em; opacity:0.82;">Prepared for {company}</p>'
        html = html[:end] + prepared + html[end:]

payload = json.dumps({"filename": filename, "content": html}).encode()
req = Request(f"{server}/api/pdf", data=payload, method="POST",
              headers={"Content-Type": "application/json"})
with urlopen(req, timeout=60) as resp:
    resp.read()  # server auto-saves to ~/Desktop/Applied Jobs CVs/

print(f"PDF saved: {filename}.pdf")
PYEOF

ok "PDF saved to: $APPLIED_DIR/"
echo
printf "${GREEN}${BOLD}═══ All done ═══${NC}\n"
[ -n "$FULL_URL" ] && printf "  ${BOLD}CV URL:${NC}     %s\n" "$FULL_URL"
[ -n "$SHORT_CODE" ] && printf "  ${BOLD}Short:${NC}      checkloops.co.uk/j/#%s\n" "$SHORT_CODE"
printf "  ${BOLD}PDF:${NC}        %s/%s.pdf\n" "$APPLIED_DIR" "$PDF_FILENAME"
printf "  ${BOLD}Company:${NC}    %s\n" "$COMPANY"
printf "  ${BOLD}Role:${NC}       %s\n" "$ROLE"
echo
