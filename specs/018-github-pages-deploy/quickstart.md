# Quickstart: GitHub Pages Deployment

## Prerequisites

- Node.js 22 LTS and dependencies installed from the repository root.
- Repository Pages enabled with **Settings → Pages → Build and deployment →
  Source: GitHub Actions**.
- The API deployed separately and configured to allow the exact CORS origin
  `https://moreira-and.github.io`.

## Validate the Pages build locally

From the repository root:

```sh
npm ci
npm run build:web -- --base=/ops-pilot/
npm run preview:web -- --host 127.0.0.1 --base=/ops-pilot/
```

Open `http://127.0.0.1:4173/ops-pilot/`. Verify the page and its CSS/JavaScript
assets load under `/ops-pilot/`. The command-line base override is intentional:
the existing Vite default remains `/opspilot/` for the current local workflow.

Confirm the publication directory contains only built frontend output:

```sh
find web/dist -maxdepth 2 -type f -print
```

Expected files are the generated HTML and its referenced static assets. No
server source, dependency directory, environment file, or credentials belong in
this directory.

## Publish and verify

1. Open a pull request targeting `main`; confirm the frontend builds and no
   Pages deployment runs.
2. Merge to `main`; follow the `GitHub Pages` workflow in the Actions tab. A
   successful deployment reports
   `https://moreira-and.github.io/ops-pilot/`.
3. Optionally dispatch the workflow on `main` to republish. Dispatching it on a
   different branch runs build validation only and does not upload or deploy.
4. Open and refresh the reported URL. Confirm its `/ops-pilot/` assets return
   successfully.
5. If the workflow fails, inspect the failed build, upload, or deploy step in
   Actions. Confirm Pages remains configured to use GitHub Actions and rerun
   only after correcting the failure.

## Existing quality gates

```sh
npm run typecheck
npm test
npm run build:web -- --base=/ops-pilot/
```
