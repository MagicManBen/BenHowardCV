# Ben Howard CV Project

This repo is the online GitHub Pages version of the CV system.

## Pages

- `index.html` is the public dashboard for current applications and custom CV URLs.
- `new-job.html` is a local-admin notice page for the hosted site.
- `cv.html` is the public personalised CV page for each application.
- `local-admin/index.html` is the local-only admin page you open on this PC to publish new applications to GitHub.

## Data

- `data/{ref}.json` stores the public application records.
- `data/applications.json` stores the dashboard index.

The local admin page writes the JSON into GitHub from this computer. The hosted site only reads the saved files and renders the public CVs.

## Start On Mac

Double-click `Start Ben Howard CV.command` in Finder to start a local server and open the dashboard plus local admin page.
