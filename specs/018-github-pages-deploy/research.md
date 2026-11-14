# Research: GitHub Pages Deployment

## Decisions

### Project site path and static build

- **Decision**: Publish at `https://moreira-and.github.io/ops-pilot/` and build
  with `/ops-pilot/` as the Vite base path.
- **Rationale**: The repository is `moreira-and/ops-pilot`, and the user selected
  the standard GitHub Pages project URL. The current Vite configuration's
  `/opspilot/` base is retained for existing local/default workflows; Vite's
  `--base=/ops-pilot/` CLI override was verified with a production build.
- **Alternatives considered**: Changing the shared Vite default (would alter
  existing local/static behavior); retaining `/opspilot/` (would require a
  custom domain or path not selected by the user).

### Pages artifact and deployment actions

- **Decision**: Use `actions/upload-pages-artifact@v4` for the static artifact
  and `actions/deploy-pages@v4` for publication. The deploy job depends on the
  build job, targets the `github-pages` environment, and exposes the deployment
  action's `page_url` output.
- **Rationale**: These are the current major versions in the official GitHub
  Pages custom workflow documentation, which also specifies `pages: write` and
  `id-token: write` for deploy and recommends an environment URL.
- **Alternatives considered**: Publishing a branch directly, committing build
  output, or using a third-party deployment action; these do not meet the
  requested artifact/deploy workflow.
- **Source**: [GitHub Docs — Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

### Trigger and branch safety

- **Decision**: Run build validation on pull requests to `main`, publish on
  pushes to `main`, and allow manual dispatch. For manual dispatches from a
  non-`main` ref, run build validation only and skip artifact upload and deploy.
- **Rationale**: This separates review validation from publication and prevents
  a manually selected feature branch from publishing unapproved content.
- **Alternatives considered**: Publishing every manual dispatch regardless of
  source ref (violates branch safety); omitting manual dispatch (does not meet
  the requested maintainability flow).

### Permissions and concurrency

- **Decision**: Give the workflow and build job only `contents: read`; grant
  `contents: read`, `pages: write`, and `id-token: write` only to the deploy
  job. Use a single Pages concurrency group with `cancel-in-progress: false`.
- **Rationale**: A build or PR cannot publish. Serializing deployments prevents
  overlapping runs from letting an earlier build finish last and replace the
  latest deployment. The GitHub Pages docs require the Pages write and OIDC
  token permissions for deployment.
- **Alternatives considered**: Granting write permissions to the whole workflow
  (unnecessary PR exposure); running deploys concurrently (publication order
  can race); canceling active deploys (can interrupt a valid deployment).

### Artifact scope and README guidance

- **Decision**: Upload only `web/dist`, and update the existing README with
  Pages setup, URL, trigger behavior, local checks, and the exact CORS origin
  for the separately hosted API.
- **Rationale**: A static-only artifact avoids publishing backend files,
  dependencies, and environment configuration. The Pages origin is
  `https://moreira-and.github.io`; the `/ops-pilot/` path is not part of a CORS
  origin.
- **Alternatives considered**: Uploading the repository root (unnecessary files
  and higher disclosure risk); documenting an API URL or credentials in the
  static frontend (API deployment is explicitly out of scope).

## Local Verification

`npm run build:web -- --base=/ops-pilot/` completed successfully in the current
workspace and generated the production output in `web/dist`.
