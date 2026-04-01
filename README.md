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

## Start On Mac

Double-click `Start Ben Howard CV.command` in Finder. It will pick a free local port, start `local_server.py`, and open the dashboard plus local admin page on `127.0.0.1`.
