# Data Model: GitHub Pages Deployment

This feature adds no application database or persisted domain records. Its
entities are workflow and publication records managed by GitHub Actions and
Pages.

## Workflow Execution

Represents one validation or publication run.

| Field | Meaning / constraint |
|-------|----------------------|
| Event | Pull request, push, or manual dispatch |
| Source ref | The branch/ref whose source is built |
| Build result | Success or failure; deployment cannot proceed after failure |
| Publish eligibility | True only for a push to `main` or a manual dispatch from `main` |
| Deployment result | Success with a Pages URL, or explicit failure; absent for build-only runs |

Transitions: `queued -> building -> build_failed` or `building -> built ->
deploying -> deployed|deploy_failed`. Pull requests and manual dispatches from
other refs stop after `built`; no publication state is created.

## Static Artifact

Represents the compiled web application uploaded to the Pages workflow.

| Field | Meaning / constraint |
|-------|----------------------|
| Source | Vite output from the existing `web/` application |
| Contents | Only generated static files under `web/dist` |
| Public base | `/ops-pilot/` |
| Transfer | GitHub Pages artifact upload action |

It MUST NOT contain repository files, `.env` files, dependencies, API server
code, credentials, or other build inputs.

## Publication Configuration

| Field | Value / constraint |
|-------|-------------------|
| Site URL | `https://moreira-and.github.io/ops-pilot/` |
| Publishing branch | `main` |
| Pages environment | `github-pages` |
| Build permission | `contents: read` |
| Deploy permissions | `contents: read`, `pages: write`, `id-token: write` |
| Concurrency | One serialized Pages publication group |

The API is deployed separately. Its CORS allowlist uses the site origin
`https://moreira-and.github.io`, without the project path.
