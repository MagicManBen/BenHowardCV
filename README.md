# Ben Howard CV Project

This repo is the online GitHub Pages version of the CV system.

## Pages

- `index.html` is the dashboard for current applications and custom CV URLs.
- `new-job.html` is the JSON review and save flow.
- `cv.html` is the public personalised CV page for each application.

## Data

- `data/{ref}.json` stores sample application records shipped with the repo.
- `data/applications.json` stores the dashboard sample index.

Applications you save through the browser are stored in this device's local storage, which avoids the GitHub Pages CSP issue and still gives you a unique CV URL and QR code for the PDF.
