# Ben Howard CV / Checkloops

This repository powers a personalised CV and job-application system for Ben Howard.

At a high level it does four things:

1. Hosts a public dashboard of live applications at `checkloops.co.uk`.
2. Hosts a tailored employer-facing page for each application at `cv.html`.
3. Provides a local admin and job-search workspace for creating, reviewing, publishing, and deleting applications.
4. Uses Supabase for persistent application storage, reviewed-job storage, contact-form submissions, and uploaded CV files.

There is no build step for the public site. The public surface is plain HTML/CSS/JS. The local tooling is mostly plain HTML/JS plus a Python server in `local_server.py`.

## Production domain

- Public site domain: `checkloops.co.uk`
- Domain mapping file: [`CNAME`](./CNAME)

## What this project contains

The repo is a mix of:

- public static site files
- a self-contained tailored CV page
- a local admin UI
- a local Python API/server
- Supabase schema/config
- sample application data and generated outputs
- a base printable CV template used for QR-linked downloads

## Runtime surfaces

There are three main runtime modes.

### 1. Public hosted site

This is the GitHub Pages / static-hosted side.

Key files:

- [`index.html`](./index.html): public application dashboard
- [`styles.css`](./styles.css): styles for the dashboard/public admin-info pages
- [`script.js`](./script.js): public dashboard logic, preview helpers, QR support
- [`cv.html`](./cv.html): tailored employer-facing application page
- [`j/index.html`](./j/index.html): short-link resolver page
- [`j/redirect.js`](./j/redirect.js): resolves short URL refs to `cv.html`
- [`data/applications.json`](./data/applications.json): public dashboard index
- [`data/*.json`](./data): per-application public JSON files
- [`downloads/`](./downloads): uploaded HTML CV downloads
- [`r/<shortcode>/index.html`](./r): generated short redirect pages

### 2. Local admin / search workspace

This is the operator side used on Ben's own machine.

Key files:

- [`local-admin/index.html`](./local-admin/index.html): paste raw advert text, generate, review, publish
- [`local-admin/admin.js`](./local-admin/admin.js): admin pipeline logic
- [`local-admin/dashboard.html`](./local-admin/dashboard.html): published applications view with delete support
- [`local-admin/jobspy.html`](./local-admin/jobspy.html): unified multi-source job search workspace
- [`local-admin/job-board-ui.js`](./local-admin/job-board-ui.js): reusable rendering helpers for job boards
- [`local-admin/reviews.html`](./local-admin/reviews.html): saved reviewed jobs
- [`local-admin/usage.html`](./local-admin/usage.html): local tool usage/opencode-quota status
- [`local-admin/indeed.html`](./local-admin/indeed.html), [`local-admin/reed.html`](./local-admin/reed.html), [`local-admin/nhs.html`](./local-admin/nhs.html), [`local-admin/adzuna.html`](./local-admin/adzuna.html): source-specific search pages
- [`local-admin/job-search-preferences.json`](./local-admin/job-search-preferences.json): saved search/scoring preferences

### 3. Local Python server

This adds a local API and local-only features.

Key files:

- [`local_server.py`](./local_server.py): local HTTP server and API
- [`content_generation.py`](./content_generation.py): evidence-bank matching + OpenAI generation
- [`ben_evidence_bank_template.csv`](./ben_evidence_bank_template.csv): evidence bank used during tailored-content generation
- [`BH CV.html`](./BH%20CV.html): base printable CV used for QR-linked downloadable CV outputs

The local server is also responsible for:

- serving the repo locally
- hiding local secrets/cache paths
- merging local/public/Supabase application sources
- generating PDFs with headless Chrome
- querying external job sources
- ranking jobs against the CV profile
- saving reviewed jobs to Supabase
- optionally publishing to GitHub and Supabase when used through its own endpoints

## Canonical files vs backups

These are the active source-of-truth files for the main experience:

- [`cv.html`](./cv.html): tailored employer page
- [`index.html`](./index.html): public dashboard
- [`script.js`](./script.js): public dashboard script
- [`styles.css`](./styles.css): public dashboard styling
- [`local-admin/index.html`](./local-admin/index.html): admin entry point
- [`local_server.py`](./local_server.py): local backend

These files exist but are not the main source of truth:

- `cv copy.html`
- `cv copy 2.html`
- `cv copy 3.html`
- `BH CV.html` is the printable CV template, not the tailored employer page

## End-to-end system flow

### 1. Application creation flow

This is the main “new job -> tailored page -> QR link” path.

1. A job advert is converted into structured JSON outside the repo.
2. That JSON is pasted into [`local-admin/index.html`](./local-admin/index.html).
3. [`local-admin/admin.js`](./local-admin/admin.js) normalises the payload into the application format.
4. If the pasted JSON already contains `personalisedContent`, the admin page uses it directly.
5. If not, the current online admin mode does not generate content in-browser. It expects pre-generated content.
6. On publish, the application is sanitised and posted to a remote publish endpoint.

Important current detail:

- `local-admin/admin.js` currently posts to Supabase edge-function URLs:
  - `functions/v1/publish`
  - `functions/v1/upload-cv`
- Those edge function source files are not in this repo.
- The repo does include equivalent local logic in [`local_server.py`](./local_server.py) for `/api/publish`, `/api/upload-cv`, `/api/generate`, and `/api/pdf`.

What gets stored:

- `ref`: stable slug for the application
- `shortCode`: short code used by QR links
- raw advert-derived fields
- generated/personalised fields
- timestamps

Where it can be stored:

- local cache: `local-cache/data/*.json`
- local cache index: `local-cache/data/applications.json`
- public GitHub JSON: `data/{ref}.json`
- public GitHub index: `data/applications.json`
- Supabase `applications` table

### 2. Public dashboard flow

The public dashboard is [`index.html`](./index.html).

It uses [`script.js`](./script.js) to:

- fetch the application index
- show live applications
- build preview and print URLs
- copy short job links

Data source rules:

- on hosted/public runtime it reads `data/applications.json`
- on local runtime it reads `/api/applications`

The dashboard does not create applications. It is read-only from the public site.

### 3. Short URL and QR flow

Short links are designed for QR codes on the printable CV.

Flow:

1. A short code is generated for an application.
2. GitHub publishing creates `r/<shortCode>/index.html`.
3. That page redirects to `/j/?r=<ref>`.
4. [`j/index.html`](./j/index.html) loads [`j/redirect.js`](./j/redirect.js).
5. `j/redirect.js` redirects to `cv.html?ref=<ref>` or `cv.html?ref=<ref>&print=1`.
6. [`cv.html`](./cv.html) fetches the application data by `ref` or `short_code`.

This two-step structure exists so short QR URLs can remain stable while the main tailored page stays at `cv.html`.

### 4. Tailored employer page flow

[`cv.html`](./cv.html) is the employer-facing companion page.

It is designed to sit alongside the PDF CV, not replace it.

Current responsibilities:

- load application data by `?ref=` or `?sc=`
- normalise raw advert data and generated personalisation fields
- render hero, motivation, fit, mapping, evidence, focus areas, skills, first-90-days, closing, and contact sections
- support embedded preview payloads via `#app=...`
- support a `print=1` mode
- insert contact form submissions into Supabase

Data loading rules in `cv.html`:

- local runtime: fetch from `/api/application?ref=...`
- public runtime by ref: fetch from `https://<project>.supabase.co/rest/v1/applications?...`
- public runtime by short code: fetch from `applications?short_code=eq...`

The tailored page uses:

- advert-derived fields for factual anchors
- generated `personalisedContent` / `gen...` fields for the actual persuasion and narrative

### 5. Contact form flow

The bottom of [`cv.html`](./cv.html) contains two employer contact forms:

- “Contact Me”
- “Contact You”

These write directly to Supabase using the anon key and the table:

- `public.cv_contact_requests`

Direction values used:

- `contact_me`
- `contact_you_email`
- `contact_you_call`

This works because the schema grants anon insert access through row-level security.

### 6. Downloadable CV flow

The downloadable/QR-linked CV flow uses the base printable CV template:

- [`BH CV.html`](./BH%20CV.html)

The logic in [`local-admin/admin.js`](./local-admin/admin.js):

1. fetches `BH CV.html`
2. inserts a QR block linking to the short application URL
3. uploads the resulting HTML

Upload destination:

- primary: remote `functions/v1/upload-cv`
- local equivalent exists in [`local_server.py`](./local_server.py) as `/api/upload-cv`

If the local server path is used directly, it can:

- upload to Supabase Storage bucket `cv-files`
- or fall back to GitHub `downloads/`

### 7. Job search and review flow

The repo also contains a local job-search workspace, centred on [`local-admin/jobspy.html`](./local-admin/jobspy.html).

That workspace:

- loads saved preferences from [`local-admin/job-search-preferences.json`](./local-admin/job-search-preferences.json)
- extracts a CV profile from [`BH CV.html`](./BH%20CV.html)
- queries enabled job sources
- normalises source-specific results
- collapses duplicates across sources
- scores jobs against Ben's CV/profile
- ranks them into tiers such as Top Match / Strong Match / Worth Reviewing / Low Match

Local API endpoints used for job search:

- `/api/job-search-preferences`
- `/api/job-search`
- `/api/indeed-search`
- `/api/reed-search`
- `/api/nhs-search`
- `/api/adzuna-search`
- `/api/review-job`
- `/api/reviewed-jobs`

Scoring is implemented in [`local_server.py`](./local_server.py) and uses:

- saved location preferences
- title/keyword rules
- employer-type detection
- salary floor
- remote/hybrid signals
- overlap with CV role titles and skill phrases

Reviewed jobs:

- can be run through OpenAI
- are stored in Supabase `reviewed_jobs`
- are shown in the local Reviews page

## Project file map

### Public site

- [`index.html`](./index.html): application dashboard
- [`new-job.html`](./new-job.html): public notice telling users to use the local admin on Ben's machine
- [`cv.html`](./cv.html): tailored application page
- [`styles.css`](./styles.css): public page styles
- [`script.js`](./script.js): dashboard/public preview logic
- [`vendor/qrious.min.js`](./vendor/qrious.min.js): QR generation

### Redirects and published artefacts

- [`j/index.html`](./j/index.html): job-link resolver shell
- [`j/redirect.js`](./j/redirect.js): redirect logic
- [`r/`](./r): generated short-link folders
- [`downloads/`](./downloads): uploaded HTML CV downloads
- [`data/`](./data): public application JSON

### Local admin

- [`local-admin/index.html`](./local-admin/index.html): publish form
- [`local-admin/admin.js`](./local-admin/admin.js): admin logic
- [`local-admin/dashboard.html`](./local-admin/dashboard.html): published-app overview
- [`local-admin/jobspy.html`](./local-admin/jobspy.html): unified search
- [`local-admin/reviews.html`](./local-admin/reviews.html): stored job reviews
- [`local-admin/usage.html`](./local-admin/usage.html): local tooling status
- [`local-admin/dashboard.css`](./local-admin/dashboard.css): local admin/search styling
- [`local-admin/job-board-ui.js`](./local-admin/job-board-ui.js): rendering helpers
- [`local-admin/job-search-preferences.json`](./local-admin/job-search-preferences.json): scoring/search config
- [`local-admin/secrets.local.example.json`](./local-admin/secrets.local.example.json): example local config

### Local backend

- [`local_server.py`](./local_server.py): local HTTP server + API
- [`content_generation.py`](./content_generation.py): local personalised-content generation
- [`ben_evidence_bank_template.csv`](./ben_evidence_bank_template.csv): evidence source for generation

### Supabase

- [`supabase/schema.sql`](./supabase/schema.sql): tables, storage bucket, RLS policies
- [`supabase/config.toml`](./supabase/config.toml): local CLI config

### Data and local-only outputs

- `local-cache/`: local application mirror, not committed
- `debug/`: publish/debug logs, not committed
- `.har` / captured cookies: intentionally ignored

## Application data shape

An application object is a single JSON payload that combines:

- factual advert extraction
- inferred job structure
- personalised/generated content
- publish metadata

Important top-level fields include:

- `ref`
- `slug`
- `shortCode`
- `companyName`
- `roleTitle`
- `location`
- `sector`
- `salary`
- `employmentType`
- `hours`
- `workplaceType`
- `shortCompanyReason`
- `shortRoleReason`
- `companySummary`
- `roleSummary`
- `advertSummary`
- `headlineAttraction`
- `rolePurpose`
- `probablePriorities`
- `keyFocusAreas`
- `coreResponsibilities`
- `essentialRequirements`
- `preferredRequirements`
- `skillsWanted`
- `toolsMethodsMentioned`
- `stakeholderGroups`
- `teamTypesMentioned`
- `senioritySignals`
- `cultureSignals`
- `likelyBusinessNeeds`
- `impliedStrategicGoals`
- `deliverablesLikely`
- `possibleHeadlineFacts`
- `matchCategories`
- `createdAt`
- `updatedAt`

Generated/personalised content is stored in one or both of these forms:

1. nested under `personalisedContent`
2. flattened into `gen...` fields for easier transport/rendering

Key personalised fields are:

- `personalisedOpening`
- `whyThisCompany`
- `whyThisRole`
- `selectedEvidenceExamples`
- `roleNeedsSummary`
- `experienceMappings`
- `focusAreasToBring`
- `fitSummary`
- `likelyContributionSummary`
- `companyHighlights`
- `cultureFitSummary`
- `first90DaysPlan`
- `closingSummary`
- `contentNotes`

The code accepts both the nested and flattened forms and normalises them on load.

## Personalised-content generation

Generation is handled locally by:

- [`content_generation.py`](./content_generation.py)

What it does:

1. loads the evidence bank CSV
2. tokenises the application fields
3. scores evidence-bank rows for relevance
4. selects a varied shortlist of examples
5. calls OpenAI Responses API server-side with structured prompts
6. expects valid JSON back

Important details:

- evidence source: [`ben_evidence_bank_template.csv`](./ben_evidence_bank_template.csv)
- active generation model default: `gpt-4.1-mini` (configurable)
- output is structured for the tailored `cv.html` page

Local-admin flow:

- `local-admin/admin.js` calls [`/api/generate`](./local_server.py) in local server mode
- main path is advert text → generation → review → publish
- a backup “load finished JSON” option exists in an advanced section for recovery/debugging

## Supabase architecture

Supabase is used for four different things.

### 1. Application storage

Table: `public.applications`

Defined in [`supabase/schema.sql`](./supabase/schema.sql) with:

- `ref text primary key`
- `company_name text`
- `role_title text`
- `location text`
- `short_code text`
- `created_at timestamptz`
- `updated_at timestamptz`
- `application jsonb`

Purpose:

- canonical remote storage for application payloads
- public runtime fetch source for `cv.html`
- optional source for public/local application index

Policies:

- RLS enabled
- public `select` allowed

Write behaviour:

- upserts are expected via service-role access, not anon access

### 2. Reviewed jobs

Table: `public.reviewed_jobs`

Used by the job-review workflow.

Key columns:

- `id uuid`
- `fingerprint text unique`
- `title`
- `company`
- `location`
- `url`
- `salary`
- `description`
- `match_score integer`
- `posted_at`
- `source_labels text[]`
- `is_remote boolean`
- `is_hybrid boolean`
- `review jsonb`
- `created_at`

Policies:

- RLS enabled
- public `select` allowed

Write behaviour:

- local server writes reviewed jobs with service-role access after an OpenAI review

### 3. Contact requests

Table: `public.cv_contact_requests`

Used by the contact forms on [`cv.html`](./cv.html).

Columns:

- `id uuid`
- `direction text`
- `cv_ref text`
- `sender_name text`
- `sender_email text`
- `sender_phone text`
- `message text`
- `page_url text`
- `created_at`

Policies:

- RLS enabled
- anon `insert` allowed

This is why the public page can submit contact forms directly from the browser.

### 4. Storage bucket

Bucket: `cv-files`

Purpose:

- stores uploaded HTML CV downloads
- objects are public

The schema bootstrap ensures the bucket exists and is public.

### Supabase keys and access model

#### Frontend / public browser use

The frontend uses the Supabase anon key for:

- reading public application records
- inserting contact-form rows

This is safe only because the table policies are intentionally narrow.

#### Local backend use

The local backend uses the service-role key for:

- upserting applications
- reading/writing reviewed jobs
- creating/checking storage buckets
- uploading downloadable CV HTML files

The service-role key should never be committed or exposed to the public browser.

### Supabase edge functions referenced by the project

The repo references edge functions at:

- `functions/v1/publish`
- `functions/v1/upload-cv`
- `functions/v1/search-nhs-jobs`

Important:

- their source code is not present in this repository
- the admin UI assumes they already exist in the connected Supabase project
- the local server contains equivalent or adjacent logic for publish/upload/generate/search, but that is separate from the remote edge-function deployment

### Local server API

Main GET routes in [`local_server.py`](./local_server.py):

- `/api/status`
- `/api/applications`
- `/api/application?ref=...`
- `/api/job-search-preferences`
- `/api/job-search`
- `/api/indeed-search`
- `/api/reed-search`
- `/api/nhs-search`
- `/api/adzuna-search`
- `/api/opencode-quota-status`
- `/api/reviewed-jobs`

Main POST routes:

- `/api/publish`
- `/api/generate`
- `/api/upload-cv`
- `/api/pdf`
- `/api/delete-application`
- `/api/review-job`

The local server also:

- blocks access to local secrets
- blocks access to `local-cache/`
- adds `Cache-Control: no-store`

Special behaviour:

- when you run `local_server.py` locally, `/` redirects to `/local-admin/jobspy.html`
- this is different from the hosted public site, where `/` is the public dashboard

## GitHub publishing behaviour

When GitHub publishing is used, the system writes:

- `data/{ref}.json`
- `data/applications.json`
- `r/{shortCode}/index.html`
- optionally `downloads/{filename}.html`

GitHub repository settings in code:

- owner: `MagicManBen`
- repo: `BenHowardCV`
- branch: `main`

Delete flow removes:

- `data/{ref}.json`
- matching item from `data/applications.json`
- `r/{shortCode}/index.html`

## Running the project locally

### Option 1: run the Python server directly

```bash
python3 local_server.py 8000
```

Then open:

- `http://127.0.0.1:8000/local-admin/jobspy.html` for job search
- `http://127.0.0.1:8000/local-admin/index.html` for new application publishing
- `http://127.0.0.1:8000/index.html` for the public dashboard

Note:

- the server itself redirects `/` to the local job-search workspace

### Option 2: Docker

```bash
docker compose up --build
```

Files used:

- [`docker-compose.yml`](./docker-compose.yml)
- [`Dockerfile`](./Dockerfile)

Container behaviour:

- exposes port `8000`
- runs `python3 local_server.py 8000`

### Local configuration

Example file:

- [`local-admin/secrets.local.example.json`](./local-admin/secrets.local.example.json)

Actual local secrets file:

- `local-admin/secrets.local.json`
- ignored by git

Config values supported:

- `githubToken`
- `cvBaseUrl`
- `openaiApiKey`
- `openaiGenerationModel`
- `supabaseUrl`
- `supabaseAnonKey`
- `supabaseServiceRoleKey`
- `supabaseBucket`
- `adzunaAppId`
- `adzunaApiKey`
- `reedApiKey`
- `ollamaBaseUrl` (legacy/inactive for the default local-admin generation path)
- `ollamaModel` (legacy/inactive for the default local-admin generation path)

The local server can also pull secrets from:

- environment variables
- macOS Keychain for GitHub, Adzuna, Reed, and OpenAI credentials

The Supabase URL can be derived automatically from the JWT payload if only the key is provided.

### Supabase setup

Minimum remote setup:

1. create the Supabase project
2. run [`supabase/schema.sql`](./supabase/schema.sql)
3. create or deploy any required edge functions not included in this repo
4. provide the anon key and service-role key to the appropriate runtime

The schema file creates:

- `applications`
- `reviewed_jobs`
- `cv_contact_requests`
- storage bucket `cv-files`
- update trigger for `applications.updated_at`
- row-level security policies

The repo also includes [`supabase/config.toml`](./supabase/config.toml) for local Supabase CLI use, although the active remote project is external.

### Security and secrets

Things intentionally not committed:

- `local-admin/secrets.local.json`
- `local-cache/`
- `debug/`
- `*.har`
- `*.log`

Relevant ignore file:

- [`.gitignore`](./.gitignore)

Security model summary:

- public application reads use anon key + public select policy
- public contact writes use anon key + anon insert policy
- admin writes should use service-role access or secure edge functions
- GitHub token stays local, not in the public frontend

## Practical caveats and current state

These points matter if you are extending or debugging the system.

#### 1. The public site and the local server do not behave identically at `/`

- hosted/public root: public dashboard
- local server root: job-search workspace

#### 2. The online local-admin UI is edge-function-first

[`local-admin/admin.js`](./local-admin/admin.js) currently talks to remote edge-function URLs for publish and upload.

That means:

- the local Python server is not the primary backend for that page right now
- generation is disabled in browser “online mode”
- the expected production publish/upload functions live outside this repo

#### 3. The local server still contains important equivalent logic

[`local_server.py`](./local_server.py) still implements:

- publish
- generate
- upload
- delete
- PDF generation
- multi-source job search
- review-job saving

So the repo contains the local backend logic, even though the current admin page points at Supabase edge functions for some operations.

#### 4. `cv.html` is the main tailored page

Use [`cv.html`](./cv.html) for the personalised employer-facing page.

Do not treat the `cv copy*.html` files as the live implementation.

#### 5. `BH CV.html` has a different role

[`BH CV.html`](./BH%20CV.html) is the printable/base CV used for download generation.

It is not the same thing as the tailored employer page.

## Recommended starting points for maintenance

If you need to change:

- public application cards/dashboard: start with [`index.html`](./index.html), [`styles.css`](./styles.css), [`script.js`](./script.js)
- tailored employer page: start with [`cv.html`](./cv.html)
- admin publish flow: start with [`local-admin/index.html`](./local-admin/index.html), [`local-admin/admin.js`](./local-admin/admin.js)
- local API/backend flow: start with [`local_server.py`](./local_server.py)
- generation behaviour: start with [`content_generation.py`](./content_generation.py)
- Supabase structure/policies: start with [`supabase/schema.sql`](./supabase/schema.sql)
- job search ranking: start with [`local_server.py`](./local_server.py) and [`local-admin/job-search-preferences.json`](./local-admin/job-search-preferences.json)

## In short

This project is not just a CV website.

It is a combined system for:

- structured application records
- tailored employer-facing application pages
- QR-linked CV downloads
- public application browsing
- local job search and ranking
- reviewed-jobs storage
- employer contact capture
- GitHub and Supabase-backed publishing

The public pages are static. The intelligence and operations sit in the local admin/search tooling and in Supabase.
