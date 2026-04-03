# Ben Howard CV / Checkloops

This repository powers Ben Howard's personalised CV and application system at `checkloops.co.uk`.

It is not just a CV website. It is a combined application workflow covering:

- a public application dashboard
- a tailored employer-facing companion page for each application
- a second, shorter QR/mobile companion page for the same application
- a local admin flow for generating, reviewing, and publishing applications
- a local job-search and reviewed-jobs workspace
- Supabase-backed storage for applications, contact requests, reviewed jobs, and downloadable CV files
- GitHub-backed publishing for public JSON, public indexes, short redirects, and optional HTML downloads

There is no frontend build step. The public site is plain HTML, CSS, and JavaScript. The local backend is a Python server in [`local_server.py`](./local_server.py).

## Production Domain

- Public domain: `https://checkloops.co.uk`
- Domain mapping file: [`CNAME`](./CNAME)

## What The System Does

At a high level, the system does five things:

1. Stores one structured application record per job.
2. Generates persuasive first-person personalised application content from a raw advert plus Ben's evidence bank.
3. Publishes two employer-facing page variants from the same application JSON:
   - a fuller desktop/email page
   - a shorter QR/mobile page
4. Generates a QR-linked downloadable CV HTML/PDF flow.
5. Provides Ben with a private local search/review/publish workspace.

## Core Product Model

Each job application is one JSON object.

That one object is the source of truth for:

- dashboard listing data
- full employer page content
- QR/mobile page content
- QR short-link destination
- downloadable CV QR target
- publish metadata

The system does not maintain separate content pipelines for desktop and QR pages. Both render from the same application record.

## Runtime Surfaces

There are four main runtime surfaces.

### 1. Public hosted site

This is the static site served from the repo.

Main files:

- [`index.html`](./index.html): public application dashboard
- [`styles.css`](./styles.css): dashboard and public-page shared styling
- [`script.js`](./script.js): public dashboard logic and some legacy/public helpers
- [`cv.html`](./cv.html): full employer-facing page
- [`cv-qr.html`](./cv-qr.html): QR/mobile employer-facing page
- [`cv-runtime.js`](./cv-runtime.js): shared application loading, normalisation, dedupe, and content-selection runtime used by both page variants
- [`cv-full.js`](./cv-full.js): full-page initialiser
- [`cv-qr.js`](./cv-qr.js): QR/mobile renderer
- [`j/index.html`](./j/index.html): short-link resolver shell
- [`j/redirect.js`](./j/redirect.js): QR-first redirect logic
- [`data/applications.json`](./data/applications.json): public application index
- [`data/*.json`](./data): per-application public JSON payloads
- [`r/<shortCode>/index.html`](./r): generated short-link redirect pages
- [`downloads/`](./downloads): optional uploaded downloadable CV HTML files

### 2. Local admin workspace

This is the operator-facing interface used on Ben's machine.

Main files:

- [`local-admin/index.html`](./local-admin/index.html): main application creation flow
- [`local-admin/admin.js`](./local-admin/admin.js): generation, review, publish, QR, and CV-download logic
- [`local-admin/dashboard.html`](./local-admin/dashboard.html): local dashboard for saved/published applications
- [`local-admin/jobspy.html`](./local-admin/jobspy.html): multi-source job-search workspace
- [`local-admin/reviews.html`](./local-admin/reviews.html): reviewed jobs viewer
- [`local-admin/usage.html`](./local-admin/usage.html): local status/opencode usage page
- [`local-admin/job-board-ui.js`](./local-admin/job-board-ui.js): shared job board UI helpers
- [`local-admin/job-search-preferences.json`](./local-admin/job-search-preferences.json): saved search and ranking preferences
- [`local-admin/secrets.local.example.json`](./local-admin/secrets.local.example.json): example config

### 3. Local Python server

This provides the local-only API and backend logic.

Main files:

- [`local_server.py`](./local_server.py): local HTTP server, API, search, publish, delete, PDF, and review logic
- [`content_generation.py`](./content_generation.py): application-generation pipeline using OpenAI + evidence bank
- [`ben_evidence_bank_template.csv`](./ben_evidence_bank_template.csv): evidence bank used to personalise applications
- [`BH CV.html`](./BH%20CV.html): base printable CV template used when building a downloadable CV with QR

### 4. Supabase

Supabase is used for:

- application storage
- reviewed jobs storage
- contact form submissions
- downloadable CV file storage

Main repo files:

- [`supabase/schema.sql`](./supabase/schema.sql): tables, bucket, and RLS policies
- [`supabase/config.toml`](./supabase/config.toml): local CLI config

## Main User Journeys

## 1. New Application Flow

This is the main Ben workflow now.

Current normal flow:

1. Open `http://127.0.0.1:8000/local-admin/`
2. Paste raw job advert text into [`local-admin/index.html`](./local-admin/index.html)
3. Click `Generate & Review`
4. [`local-admin/admin.js`](./local-admin/admin.js) sends the advert to `POST /api/generate`
5. [`local_server.py`](./local_server.py) calls [`content_generation.py`](./content_generation.py)
6. [`content_generation.py`](./content_generation.py) does:
   - advert extraction
   - evidence selection from the CSV
   - personalised content generation with OpenAI Responses API
   - final merged application object assembly
7. The admin UI shows:
   - parsed advert fields
   - personalised content
   - evidence selections
   - raw JSON
8. Ben confirms and publishes

Important current detail:

- generation is local and server-side
- OpenAI is called from the Python backend, never from browser JS
- the browser only calls the local backend

Backup path:

- the local admin still has a hidden advanced JSON loader for debugging or recovery
- this is not the main workflow

## 2. Publish Flow

After review, the admin UI publishes the application.

Current publish path from [`local-admin/admin.js`](./local-admin/admin.js):

- publish request goes to remote Supabase edge function:
  - `functions/v1/publish`
- downloadable CV upload goes to remote Supabase edge function:
  - `functions/v1/upload-cv`

Important nuance:

- local generation uses the local Python server
- publish and CV upload are still edge-function-first in the admin UI
- the repo also contains equivalent local publish/upload logic inside [`local_server.py`](./local_server.py), but the current admin page is not wired to those routes for its main publish step

What gets written on publish:

- local cache copy
- optionally Supabase `applications`
- optionally GitHub `data/{ref}.json`
- optionally GitHub `data/applications.json`
- optionally GitHub `r/{shortCode}/index.html`

## 3. Public Employer Page Flow

Each application now has two public variants.

### Full employer page

- URL pattern: `cv.html?ref=<ref>`
- file: [`cv.html`](./cv.html)
- script: [`cv-full.js`](./cv-full.js)
- shared runtime: [`cv-runtime.js`](./cv-runtime.js)

Purpose:

- email links
- desktop browsing
- fuller editorial review

Content strategy:

- richer opening and motivation
- role understanding
- fit summary
- evidence mapping
- focus areas
- evidence in practice
- skills snapshot
- first-90-days view
- fuller closing
- contact forms

### QR/mobile page

- URL pattern: `cv-qr.html?ref=<ref>`
- file: [`cv-qr.html`](./cv-qr.html)
- script: [`cv-qr.js`](./cv-qr.js)
- shared runtime: [`cv-runtime.js`](./cv-runtime.js)

Purpose:

- QR scans from the printed CV
- mobile readers who have probably already seen the main CV
- faster proof-led review

Content strategy:

- quick fit
- strongest reasons
- 2 to 3 strongest proof points
- what Ben would bring
- compact CTA section
- link through to the full version

Important product decision:

- this is not just responsive design
- it is a different user journey from the full page

## 4. Short URL / QR Flow

Short links are used for QR codes and other compact sharing.

Current flow:

1. each application gets a `shortCode`
2. GitHub publish creates `r/<shortCode>/index.html`
3. that static file redirects to `/j/?r=<ref>`
4. [`j/index.html`](./j/index.html) loads [`j/redirect.js`](./j/redirect.js)
5. `j/redirect.js` now resolves:
   - default: `cv-qr.html?ref=<ref>`
   - if `print=1`: `cv.html?ref=<ref>&print=1`

So the QR route is now QR/mobile-first.

### Current public URL contract

- Full employer page: `cv.html?ref=<ref>`
- QR/mobile page: `cv-qr.html?ref=<ref>`
- Short QR route by ref: `j/?r=<ref>`
- Short QR route by short code: `r/<shortCode>/`

### What the QR code should point to

The QR code should point to the QR/mobile route, not the full page.

In practice that means:

- preferred QR URL: `https://checkloops.co.uk/r/<shortCode>/`
- fallback QR URL when no short code exists yet: `https://checkloops.co.uk/j/?r=<ref>`

## 5. Downloadable CV Flow

The downloadable CV uses the base template:

- [`BH CV.html`](./BH%20CV.html)

Current flow in [`local-admin/admin.js`](./local-admin/admin.js):

1. fetch base `BH CV.html`
2. generate a QR code image with `qrious`
3. inject a QR block into the sidebar(s)
4. make the QR block link to the QR/mobile URL
5. upload the resulting HTML through `functions/v1/upload-cv`
6. open/download the uploaded HTML CV

Upload destinations:

- primary: Supabase Storage bucket `cv-files`
- fallback supported in local backend: GitHub `downloads/`

## 6. Job Search / Review Flow

The repo also contains a separate local workspace for finding and reviewing jobs.

Main entry:

- [`local-admin/jobspy.html`](./local-admin/jobspy.html)

That workspace:

- pulls jobs from multiple sources
- scores them against Ben's profile
- supports saving reviewed jobs
- supports AI review when configured

Related files:

- [`local-admin/job-board-ui.js`](./local-admin/job-board-ui.js)
- [`local-admin/job-search-preferences.json`](./local-admin/job-search-preferences.json)
- [`local-admin/reviews.html`](./local-admin/reviews.html)

## One Application Record, Two Page Variants

This is the most important architectural rule in the repo.

One application JSON object drives:

- dashboard listing
- full employer page
- QR/mobile page
- QR short route
- downloadable CV QR target

The code does not create a separate "QR schema".

Instead:

- [`cv-runtime.js`](./cv-runtime.js) loads and normalises the application
- [`cv-full.js`](./cv-full.js) renders the editorial full page
- [`cv-qr.js`](./cv-qr.js) renders the shorter QR/mobile page

The shared runtime handles:

- loading by `ref`
- loading by `sc`
- embedded preview payloads
- top-level and nested personalised content normalisation
- dedupe and selectivity helpers
- evidence cleaning
- fallback content derivation

## Application Data Model

An application record combines:

- advert extraction
- inferred role structure
- personalised content
- evidence mapping
- publish metadata

### Important top-level fields

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
- `toneKeywords`
- `probablePriorities`
- `keyFocusAreas`
- `companyPridePoints`
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

### Personalised content fields

These usually live under `personalisedContent`, but may also be flattened into `gen...` fields for easier rendering and transport.

Key personalised fields:

- `heroPositioning`
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
- `closingProofPoints`
- `contentNotes`

### Evidence example item shape

Evidence examples typically contain:

- `exampleId`
- `exampleTitle`
- `bestMatchedRoleNeed`
- `proofAngle`
- `whyChosen`
- `suggestedUsage`
- `shortLine`

### Experience mapping item shape

- `roleNeed`
- `evidenceExampleId`
- `myEvidence`
- `relevance`
- `proofAngle`

### Focus area item shape

- `title`
- `summary`

### First-90-days item shape

- `phase`
- `focus`
- `detail`

## Personalised Content Generation

Generation lives in:

- [`content_generation.py`](./content_generation.py)

The generation pipeline does three main things:

1. Extracts structured advert fields.
2. Selects relevant evidence from [`ben_evidence_bank_template.csv`](./ben_evidence_bank_template.csv).
3. Generates personalised application content with OpenAI.

### Current active AI model path

The active local-admin application-generation path uses:

- OpenAI Responses API
- server-side only
- default model: `gpt-4.1-mini`

The current primary generation route is:

- browser calls `POST /api/generate`
- [`local_server.py`](./local_server.py) handles the request
- [`content_generation.py`](./content_generation.py) calls OpenAI

### What OpenAI is used for

In the application pipeline:

- structured advert extraction
- personalised content writing
- evidence-led content shaping

### Evidence bank usage

The evidence bank CSV is not decorative. It is part of the generation logic.

The pipeline:

- tokenises advert and role signals
- scores evidence rows for relevance
- selects a varied shortlist
- passes that shortlist into the structured generation step

### Browser AI calls

There are no browser-side OpenAI calls in the main application-generation flow.

## AI Usage In This Repository

The project currently uses AI in these places:

### 1. Application generation

- file: [`content_generation.py`](./content_generation.py)
- entry route: `POST /api/generate`
- provider: OpenAI
- purpose: build the final structured application object from a raw advert plus evidence bank

### 2. Reviewed job analysis

- file: [`local_server.py`](./local_server.py)
- route: `POST /api/review-job`
- provider: OpenAI when configured
- purpose: analyse/save reviewed jobs

### 3. Legacy Ollama settings

Legacy config keys still exist in [`local_server.py`](./local_server.py):

- `ollamaBaseUrl`
- `ollamaModel`

These are retained for compatibility but are not the active local-admin application-generation path.

## Supabase Architecture

Supabase is used for four separate concerns.

## 1. Applications Table

Table: `public.applications`

Defined in [`supabase/schema.sql`](./supabase/schema.sql) as:

- `ref text primary key`
- `company_name text`
- `role_title text`
- `location text`
- `short_code text`
- `created_at timestamptz`
- `updated_at timestamptz`
- `application jsonb`

Purpose:

- remote canonical application storage
- public-page runtime fetch source
- optional merged index source

Policies:

- RLS enabled
- public `select` allowed

Expected write model:

- service-role writes
- not public anon writes

## 2. Reviewed Jobs Table

Table: `public.reviewed_jobs`

Purpose:

- stores reviewed job records
- supports the local review workspace

Includes:

- fingerprint
- advert fields
- scoring info
- AI review JSON

Policies:

- RLS enabled
- public `select` allowed

## 3. Contact Requests Table

Table: `public.cv_contact_requests`

Purpose:

- stores contact submissions from the full employer page

Important details:

- full page only
- QR/mobile page uses direct CTA links instead of forms

Columns include:

- `direction`
- `cv_ref`
- `sender_name`
- `sender_email`
- `sender_phone`
- `message`
- `page_url`

Policies:

- RLS enabled
- anon `insert` allowed

That is why the public contact forms can submit directly from browser JS.

## 4. Storage Bucket

Bucket: `cv-files`

Purpose:

- stores uploaded downloadable CV HTML files
- bucket is public

## Supabase Keys And Access Model

### Public browser use

The public browser runtime uses the anon key for:

- reading application records
- inserting contact requests

This is only safe because the relevant RLS policies are narrow.

### Local backend use

The local backend uses the service-role key for:

- upserting applications
- reviewed jobs writes
- storage bucket operations
- downloadable CV uploads

The service-role key must never be exposed in browser code.

## Edge Functions Referenced By The Repo

The repo references these remote edge functions:

- `functions/v1/publish`
- `functions/v1/upload-cv`
- `functions/v1/search-nhs-jobs`

Important:

- their source code is not in this repository
- the current admin UI still expects the publish and upload functions to exist remotely
- the local Python server contains equivalent publish/upload logic, but the current UI is not using those endpoints as its main publish path

## Local Server API

Main server file:

- [`local_server.py`](./local_server.py)

Important runtime behaviour:

- local `/` redirects to `/local-admin/jobspy.html`
- local `/api/*` adds no-store behaviour and blocks local secrets paths

### Main GET routes

- `/api/status`
- `/api/applications`
- `/api/application?ref=...`
- `/api/application?sc=...`
- `/api/job-search-preferences`
- `/api/job-search`
- `/api/indeed-search`
- `/api/reed-search`
- `/api/nhs-search`
- `/api/adzuna-search`
- `/api/opencode-quota-status`
- `/api/reviewed-jobs`

### Main POST routes

- `/api/generate`
- `/api/publish`
- `/api/upload-cv`
- `/api/pdf`
- `/api/delete-application`
- `/api/review-job`

### What these routes do

- `/api/generate`: advert -> evidence selection -> OpenAI -> final application JSON
- `/api/publish`: local/backend publish path with URL generation and GitHub/Supabase support
- `/api/upload-cv`: upload generated HTML CV to Supabase or GitHub
- `/api/pdf`: build PDFs locally
- `/api/delete-application`: delete local/remote records
- `/api/review-job`: save reviewed jobs, optionally with AI review

## Public Data Loading Rules

The public pages use different data sources depending on runtime.

### Full and QR pages

Shared loading lives in [`cv-runtime.js`](./cv-runtime.js).

Supported load modes:

- embedded preview payload via `#app=...`
- `?ref=<ref>`
- `?sc=<shortCode>`

Data source rules:

- local runtime:
  - `/api/application?ref=...`
  - `/api/application?sc=...`
- hosted runtime:
  - Supabase REST by `ref`
  - Supabase REST by `short_code`

### Dashboard

[`script.js`](./script.js) loads:

- hosted/public runtime: `data/applications.json`
- local runtime: `/api/applications`

## Current Page And URL Behaviour

### Full employer page

- public direct URL: `https://checkloops.co.uk/cv.html?ref=<ref>`
- local direct URL: `http://127.0.0.1:8000/cv.html?ref=<ref>`

### QR/mobile page

- public direct URL: `https://checkloops.co.uk/cv-qr.html?ref=<ref>`
- local direct URL: `http://127.0.0.1:8000/cv-qr.html?ref=<ref>`

### Short QR route

- public short route by ref: `https://checkloops.co.uk/j/?r=<ref>`
- public short route by short code: `https://checkloops.co.uk/r/<shortCode>/`

### Print route

- `print=1` is treated as full-page print intent
- short routes preserve this by resolving to `cv.html?ref=<ref>&print=1`

## GitHub Publishing Behaviour

When GitHub publishing is used, the system writes:

- `data/{ref}.json`
- `data/applications.json`
- `r/{shortCode}/index.html`
- optionally `downloads/{filename}.html`

GitHub repo details in code:

- owner: `MagicManBen`
- repo: `BenHowardCV`
- branch: `main`

Delete flow removes:

- `data/{ref}.json`
- matching index entry
- `r/{shortCode}/index.html`

## Local Configuration

Example file:

- [`local-admin/secrets.local.example.json`](./local-admin/secrets.local.example.json)

Real local config file:

- `local-admin/secrets.local.json`
- gitignored

### Supported config values

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
- `ollamaBaseUrl` (legacy/inactive for the main application-generation path)
- `ollamaModel` (legacy/inactive for the main application-generation path)

### Other config sources

The local backend can also read credentials from:

- environment variables
- macOS Keychain

Current keychain-backed secrets include:

- GitHub token
- Adzuna app ID
- Adzuna API key
- Reed API key
- OpenAI API key

### Default generation model

If nothing is configured, generation defaults to:

- `gpt-4.1-mini`

## Running Locally

## Option 1: Python server

```bash
python3 local_server.py 8000
```

Open:

- `http://127.0.0.1:8000/local-admin/`
- `http://127.0.0.1:8000/local-admin/jobspy.html`
- `http://127.0.0.1:8000/index.html`

Important:

- local `/` redirects to the job-search workspace, not the public dashboard

## Option 2: Docker

```bash
docker compose up --build
```

Relevant files:

- [`Dockerfile`](./Dockerfile)
- [`docker-compose.yml`](./docker-compose.yml)

## Canonical Files vs Non-Canonical Files

These are the live source-of-truth files for the main system:

- [`cv.html`](./cv.html)
- [`cv-qr.html`](./cv-qr.html)
- [`cv-runtime.js`](./cv-runtime.js)
- [`cv-full.js`](./cv-full.js)
- [`cv-qr.js`](./cv-qr.js)
- [`index.html`](./index.html)
- [`styles.css`](./styles.css)
- [`script.js`](./script.js)
- [`local-admin/index.html`](./local-admin/index.html)
- [`local-admin/admin.js`](./local-admin/admin.js)
- [`local_server.py`](./local_server.py)
- [`content_generation.py`](./content_generation.py)

These exist but are not the live tailored employer-page implementation:

- `cv copy.html`
- `cv copy 2.html`
- `cv copy 3.html`

[`BH CV.html`](./BH%20CV.html) is also a live file, but it is the printable CV template, not the public tailored employer page.

## Security And Secrets

Things intentionally not committed:

- `local-admin/secrets.local.json`
- `local-cache/`
- `debug/`
- `*.har`
- `*.log`

Relevant ignore file:

- [`.gitignore`](./.gitignore)

Security model summary:

- public reads use anon key + public RLS read policies
- public contact writes use anon key + anon insert policy
- application upserts use service-role access or secure edge functions
- OpenAI API key remains server-side/local only
- GitHub token remains local only

## Project File Map

### Public pages and assets

- [`index.html`](./index.html): public dashboard
- [`new-job.html`](./new-job.html): public notice page pointing users to the local admin on Ben's machine
- [`cv.html`](./cv.html): full employer page
- [`cv-qr.html`](./cv-qr.html): QR/mobile employer page
- [`cv-runtime.js`](./cv-runtime.js): shared full/QR runtime
- [`cv-full.js`](./cv-full.js): full renderer bootstrap
- [`cv-qr.js`](./cv-qr.js): QR renderer bootstrap
- [`styles.css`](./styles.css): shared public styles
- [`script.js`](./script.js): dashboard/public helpers
- [`vendor/qrious.min.js`](./vendor/qrious.min.js): QR generation library

### Redirects and public artefacts

- [`j/index.html`](./j/index.html): redirect shell
- [`j/redirect.js`](./j/redirect.js): QR-first redirect logic
- [`r/`](./r): generated short redirects
- [`data/`](./data): public application JSON
- [`downloads/`](./downloads): uploaded downloadable CV HTML files

### Local admin

- [`local-admin/index.html`](./local-admin/index.html): generate/review/publish page
- [`local-admin/admin.js`](./local-admin/admin.js): admin workflow logic
- [`local-admin/dashboard.html`](./local-admin/dashboard.html): local dashboard
- [`local-admin/jobspy.html`](./local-admin/jobspy.html): search workspace
- [`local-admin/reviews.html`](./local-admin/reviews.html): reviewed jobs
- [`local-admin/usage.html`](./local-admin/usage.html): local usage/status page
- [`local-admin/dashboard.css`](./local-admin/dashboard.css): local styling
- [`local-admin/job-board-ui.js`](./local-admin/job-board-ui.js): board UI helpers

### Local backend and generation

- [`local_server.py`](./local_server.py): local API and operational backend
- [`content_generation.py`](./content_generation.py): application-generation logic
- [`ben_evidence_bank_template.csv`](./ben_evidence_bank_template.csv): evidence bank

### Supabase

- [`supabase/schema.sql`](./supabase/schema.sql)
- [`supabase/config.toml`](./supabase/config.toml)

## Recommended Starting Points For Maintenance

If you need to change:

- full employer page: start with [`cv.html`](./cv.html), [`cv-runtime.js`](./cv-runtime.js), [`cv-full.js`](./cv-full.js)
- QR/mobile page: start with [`cv-qr.html`](./cv-qr.html), [`cv-runtime.js`](./cv-runtime.js), [`cv-qr.js`](./cv-qr.js)
- dashboard/public links: start with [`index.html`](./index.html), [`styles.css`](./styles.css), [`script.js`](./script.js)
- short redirect behaviour: start with [`j/redirect.js`](./j/redirect.js)
- admin generation/review flow: start with [`local-admin/index.html`](./local-admin/index.html), [`local-admin/admin.js`](./local-admin/admin.js)
- generation logic/schema/prompting: start with [`content_generation.py`](./content_generation.py)
- local API/backend flow: start with [`local_server.py`](./local_server.py)
- Supabase tables/policies: start with [`supabase/schema.sql`](./supabase/schema.sql)
- job search ranking: start with [`local_server.py`](./local_server.py) and [`local-admin/job-search-preferences.json`](./local-admin/job-search-preferences.json)

## Practical Caveats

### 1. Local root and public root are different

- local `/` -> job-search workspace
- public `/` -> dashboard

### 2. Generation and publish are split across backends

Current normal local-admin behaviour is:

- generate locally through `/api/generate`
- publish remotely through edge functions

That split is intentional in the current implementation.

### 3. QR route is now intentionally different from the full page

Do not treat the QR/mobile page as a compressed copy of the full page.

It is a distinct render path with different content-selection logic.

### 4. One application JSON drives both pages

Do not fork the application data model for QR unless there is a compelling reason.

The current architecture depends on shared source data plus render-specific selection.

## In Short

This repository is a static site plus a local application engine.

The public side serves:

- a dashboard
- a full employer page
- a shorter QR/mobile page
- short redirects

The local side handles:

- advert ingestion
- AI-assisted tailored content generation
- evidence selection
- application review
- publish orchestration
- job search and review

Supabase provides storage and public-data access. GitHub provides public JSON, redirects, and optional downloadable artefacts. OpenAI provides the current server-side application-generation intelligence.
