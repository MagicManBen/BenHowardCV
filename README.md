# Ben Howard CV Project

This repo is the online GitHub Pages version of the CV system.

## Pages

- `index.html` is the public dashboard for current applications and custom CV URLs.
- `new-job.html` is a local-admin notice page for the hosted site.
- `cv.html` is the public personalised CV page for each application.
- `local-admin/index.html` is the local-only admin page you open on this PC to publish new applications to GitHub.
- `local_server.py` is the local server that serves the site on your Mac and handles GitHub writes with your local credential.

## Data

- `data/{ref}.json` stores the public application records.
- `data/applications.json` stores the dashboard index.

The local admin page now talks to `local_server.py` on your Mac. That local server is the only place that reads your GitHub token. The hosted site only reads the saved files and renders the public CVs.

## Local AI config

Stage 3 generation now uses your local Ollama instance instead of the OpenAI API.

You can configure it in `local-admin/secrets.local.json` or with environment variables.

Example `local-admin/secrets.local.json`:

```json
{
  "githubToken": "ghp_...",
  "cvBaseUrl": "https://checkloops.co.uk/cv.html",
  "ollamaBaseUrl": "http://localhost:11434",
  "ollamaModel": "llama3.2"
}
```

Environment variable examples:

```bash
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=llama3.2
```

## Start On Mac

Double-click `Start Ben Howard CV.command` in Finder. It will pick a free local port, start `local_server.py`, and open the dashboard plus local admin page on `127.0.0.1`.
