# GitHub Pages Workflow Contract

## Events and publication conditions

| Event | Condition | Build | Upload artifact | Deploy |
|-------|-----------|-------|-----------------|--------|
| `pull_request` targeting `main` | Always | Yes | No | No |
| `push` to `main` | Always | Yes | Yes | Yes |
| `workflow_dispatch` on `main` | Always | Yes | Yes | Yes |
| `workflow_dispatch` on another ref | Always | Yes | No | No |

No workflow event may publish a ref other than `main`.

## Build artifact

- Build the existing frontend with the public base `/ops-pilot/`.
- Upload exactly `web/dist` using `actions/upload-pages-artifact`.
- Do not upload source, backend, dependencies, secrets, or environment files.
- A build or artifact upload failure makes the workflow fail and blocks deploy.

## Deploy job

- Use `actions/deploy-pages` and require successful completion of the build job.
- Target the `github-pages` environment and expose the returned Pages URL.
- Grant only `contents: read`, `pages: write`, and `id-token: write` to the deploy
  job. Non-deploy runs have only `contents: read`.
- Serialize all Pages deployments to avoid out-of-order final versions.
- A failed deployment MUST leave the workflow failed, not report a published URL
  as a successful result.

## README publication information

The README must identify:

- Public site: `https://moreira-and.github.io/ops-pilot/`.
- Pages source setup: GitHub Actions.
- Which events build and which events publish, including manual branch gating.
- The local base-path build and preview checks.
- API CORS origin: `https://moreira-and.github.io`; API hosting and credentials
  remain separate from this static site.
