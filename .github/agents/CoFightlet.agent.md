---
name: CoFightlet
description: >
  Project-specialist agent for the BenHowardCV pipeline. Handles changes to
  cv.html (public CV), local-admin/ (admin UI), Python backend (local_server.py,
  content_generation.py, company_research.py), and the evidence bank CSV.
  Use for any task involving the CV rendering, admin workflow, API endpoints,
  content generation prompts, or GitHub Pages deployment.
argument-hint: "a change to the CV, admin UI, or backend pipeline"
tools: [vscode/extensions, vscode/getProjectSetupInfo, vscode/installExtension, vscode/memory, vscode/newWorkspace, vscode/resolveMemoryFileUri, vscode/runCommand, vscode/vscodeAPI, vscode/askQuestions, execute/runNotebookCell, execute/testFailure, execute/getTerminalOutput, execute/awaitTerminal, execute/killTerminal, execute/createAndRunTask, execute/runInTerminal, execute/runTests, read/getNotebookSummary, read/problems, read/readFile, read/viewImage, read/terminalSelection, read/terminalLastCommand, agent/runSubagent, edit/createDirectory, edit/createFile, edit/createJupyterNotebook, edit/editFiles, edit/editNotebook, edit/rename, search/changes, search/codebase, search/fileSearch, search/listDirectory, search/searchResults, search/textSearch, search/usages, web/fetch, web/githubRepo, com.supabase/mcp/apply_migration, com.supabase/mcp/confirm_cost, com.supabase/mcp/create_branch, com.supabase/mcp/create_project, com.supabase/mcp/delete_branch, com.supabase/mcp/deploy_edge_function, com.supabase/mcp/execute_sql, com.supabase/mcp/generate_typescript_types, com.supabase/mcp/get_advisors, com.supabase/mcp/get_cost, com.supabase/mcp/get_edge_function, com.supabase/mcp/get_logs, com.supabase/mcp/get_organization, com.supabase/mcp/get_project, com.supabase/mcp/get_project_url, com.supabase/mcp/get_publishable_keys, com.supabase/mcp/list_branches, com.supabase/mcp/list_edge_functions, com.supabase/mcp/list_extensions, com.supabase/mcp/list_migrations, com.supabase/mcp/list_organizations, com.supabase/mcp/list_projects, com.supabase/mcp/list_tables, com.supabase/mcp/merge_branch, com.supabase/mcp/pause_project, com.supabase/mcp/rebase_branch, com.supabase/mcp/reset_branch, com.supabase/mcp/restore_project, com.supabase/mcp/search_docs, github/add_comment_to_pending_review, github/add_issue_comment, github/add_reply_to_pull_request_comment, github/assign_copilot_to_issue, github/create_branch, github/create_or_update_file, github/create_pull_request, github/create_pull_request_with_copilot, github/create_repository, github/delete_file, github/fork_repository, github/get_commit, github/get_copilot_job_status, github/get_file_contents, github/get_label, github/get_latest_release, github/get_me, github/get_release_by_tag, github/get_tag, github/get_team_members, github/get_teams, github/issue_read, github/issue_write, github/list_branches, github/list_commits, github/list_issue_types, github/list_issues, github/list_pull_requests, github/list_releases, github/list_tags, github/merge_pull_request, github/pull_request_read, github/pull_request_review_write, github/push_files, github/request_copilot_review, github/search_code, github/search_issues, github/search_pull_requests, github/search_repositories, github/search_users, github/sub_issue_write, github/update_pull_request, github/update_pull_request_branch, github/run_secret_scanning, browser/openBrowserPage, gitkraken/git_add_or_commit, gitkraken/git_blame, gitkraken/git_branch, gitkraken/git_checkout, gitkraken/git_log_or_diff, gitkraken/git_push, gitkraken/git_stash, gitkraken/git_status, gitkraken/git_worktree, gitkraken/gitkraken_workspace_list, gitkraken/gitlens_commit_composer, gitkraken/gitlens_launchpad, gitkraken/gitlens_start_review, gitkraken/gitlens_start_work, gitkraken/issues_add_comment, gitkraken/issues_assigned_to_me, gitkraken/issues_get_detail, gitkraken/pull_request_assigned_to_me, gitkraken/pull_request_create, gitkraken/pull_request_create_review, gitkraken/pull_request_get_comments, gitkraken/pull_request_get_detail, gitkraken/repository_get_file_content, vscode.mermaid-chat-features/renderMermaidDiagram, github.vscode-pull-request-github/issue_fetch, github.vscode-pull-request-github/labels_fetch, github.vscode-pull-request-github/notification_fetch, github.vscode-pull-request-github/doSearch, github.vscode-pull-request-github/activePullRequest, github.vscode-pull-request-github/pullRequestStatusChecks, github.vscode-pull-request-github/openPullRequest, ms-python.python/getPythonEnvironmentInfo, ms-python.python/getPythonExecutableCommand, ms-python.python/installPythonPackage, ms-python.python/configurePythonEnvironment, vscjava.vscode-java-debug/debugJavaApplication, vscjava.vscode-java-debug/setJavaBreakpoint, vscjava.vscode-java-debug/debugStepOperation, vscjava.vscode-java-debug/getDebugVariables, vscjava.vscode-java-debug/getDebugStackTrace, vscjava.vscode-java-debug/evaluateDebugExpression, vscjava.vscode-java-debug/getDebugThreads, vscjava.vscode-java-debug/removeJavaBreakpoints, vscjava.vscode-java-debug/stopDebugSession, vscjava.vscode-java-debug/getDebugSessionInfo, todo]
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