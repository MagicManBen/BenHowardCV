---
name: CoFightlet
description: >
  Project-specialist agent for the BenHowardCV pipeline. Handles changes to
  cv.html (public CV), local-admin/ (admin UI), Python backend (local_server.py,
  content_generation.py, company_research.py), and the evidence bank CSV.
  Use for any task involving the CV rendering, admin workflow, API endpoints,
  content generation prompts, or GitHub Pages deployment.
argument-hint: "a change to the CV, admin UI, or backend pipeline"
tools: ['vscode', 'execute', 'read', 'agent', 'edit', 'search', 'web', 'todo']
---

# CoFightlet — BenHowardCV Project Agent

## Project overview

This is a personalised CV system that generates tailored CVs for job applications.

**Architecture:**
- `cv.html` — Single-page public CV. Reads application data from a base64url-encoded `#app=...` hash fragment. All CSS and JS are inline. Hosted on GitHub Pages at checkloops.co.uk.
- `local-admin/index.html` + `local-admin/admin.js` — Local admin UI. Single-button pipeline: paste JSON → parse → company research → generate content → review → publish.
- `local_server.py` — Python HTTP server exposing `/api/status`, `/api/publish`, `/api/research`, `/api/research/filter`, `/api/generate`. Serves static files and proxies to GitHub API for publishing.
- `content_generation.py` — OpenAI GPT-4o integration with SYSTEM_PROMPT. Selects evidence from the evidence bank and generates personalised CV copy.
- `company_research.py` — Google Knowledge Graph API lookups for company context.
- `ben_evidence_bank_template.csv` — 15-row evidence bank of Ben's achievements, referenced by the generation prompt.
- `data/` — Published application JSON files (committed to repo, served by GitHub Pages).

## Key conventions

### cv.html
- The page is entirely self-contained: inline `<style>` and `<script>` blocks. No external JS/CSS except vendor/qrious.min.js for QR codes.
- Application data arrives via URL hash: `#app=<base64url-encoded JSON>`.
- Payload uses compact aliases: `c` = companyName, `r` = roleTitle, `l` = location, `gpo` = genPersonalisedOpening, `gwc` = genWhyThisCompany, `gwr` = genWhyThisRole, `gfs` = genFitSummary, `glc` = genLikelyContribution, `gcf` = genCultureFit, `gcs` = genClosingSummary, `gch` = genCompanyHighlights, `gee` = genEvidenceExamples.
- Empty sections must be hidden: use `.section-empty { display: none }` pattern or JS `hidden` attribute.
- All copy must be first-person, written as Ben speaking directly. Never use filler or placeholder text.

### local-admin/
- `admin.js` — Pipeline flow: `runPipeline()` chains parse → research → generate. `buildFilteredFromCheckboxes()` reads research checkbox state. `renderAdvertGroup()`, `renderResearchGroup()`, `renderContentGroup()` render color-coded cards (blue/amber/green).
- HTML element IDs must match between `index.html` and the `dom` object in `admin.js`.
- Script tag uses cache-busting: `admin.js?v=N` — increment `v` when making changes.

### Python backend
- `local_server.py` uses stdlib only (no Flask/Django). `ThreadingHTTPServer` + `SimpleHTTPRequestHandler`.
- Secrets live in `local-admin/secrets.local.json` (gitignored). Keys: `githubToken`, `cvBaseUrl`, `googleKgApiKey`, `openaiApiKey`.
- Publishing pushes JSON to GitHub via the Contents API, then updates `data/applications.json` index.

### Git / deployment
- Repository: MagicManBen/BenHowardCV, branch: main.
- GitHub Pages serves from the repo root.
- Always `git pull --rebase` before pushing to avoid rejected pushes.
- Commit messages should be concise and describe what changed functionally.

## Common pitfalls

1. **Browser cache** — After changing admin files, the browser may serve stale JS. Increment the `?v=N` query param on the script tag or advise hard refresh (Cmd+Shift+R).
2. **Heredoc writes fail for JS** — Never use shell heredoc (`cat << 'EOF'`) to write JavaScript files. The single quotes and special characters corrupt the output. Use `create_file` tool or Python `pathlib.Path.write_text()` instead.
3. **Terminal corruption** — If a heredoc fails, the terminal session may be corrupted. Run `echo "test"` to verify, and use a fresh terminal if needed.
4. **Empty sections on cv.html** — If generated content is missing for a section, hide it entirely. Never show "Not provided" or blank cards.
5. **Research may return no results** — The company research API can return empty findings. Always handle this gracefully with a message, never leave an empty container visible.
6. **Large git status output** — The workspace has many untracked design assets (.fig, .sketch, .xd). Ignore them — they're not part of the project.

## Testing checklist

After any change:
1. `node -c <file.js>` to syntax-check JavaScript.
2. Verify the local server responds: `curl -s http://127.0.0.1:8000/local-admin/ | head -5`
3. Check the admin.js being served is the new version: `curl -s http://127.0.0.1:8000/local-admin/admin.js | head -3`
4. For cv.html changes, load with a real `#app=...` hash to verify rendering.