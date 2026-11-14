# Implementation Plan: GitHub Pages Deployment

**Branch**: `main` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-github-pages-deploy/spec.md`

## Summary

Publish the existing War Room as a project GitHub Pages site at
`https://moreira-and.github.io/ops-pilot/`. A GitHub Actions workflow will build
the static `web/` application with `/ops-pilot/` as its public base, upload only
`web/dist`, and deploy it using the requested Pages artifact and deploy actions.
Pull requests build without publishing; pushes to `main` and manual runs on
`main` publish. A manual run from another branch is build-only. The README will
explain setup, operation, local verification, and the separate API CORS origin.

## Technical Context

**Language/Version**: Node.js 22 LTS; TypeScript ESM (existing frontend build)

**Primary Dependencies**: Existing Vite 8 build; GitHub Actions checkout/setup-node
and GitHub Pages upload/deploy actions

**Storage**: No application data storage; GitHub Pages artifact is transient
workflow output

**Testing**: `npm run build:web -- --base=/ops-pilot/`; inspect generated asset
paths and artifact contents; workflow trigger/permission review; verify hosted
site URL and README instructions

**Target Platform**: GitHub Actions runners and GitHub Pages project site

**Project Type**: Static web deployment workflow for the existing monorepo

**Performance Goals**: Make approved changes available within 10 minutes, as
specified by SC-001

**Constraints**: Public base path `/ops-pilot/`; deploy only from `main`; PRs
must not publish; manual dispatch on other branches is build-only; use
`actions/upload-pages-artifact` and `actions/deploy-pages`; least-privilege
permissions; serialize Pages deployment runs; artifact contains only `web/dist`;
no credentials or API backend in the static site

**Scale/Scope**: One repository site, one workflow, one static artifact; API
deployment and authorization remain outside this feature

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan |
|-----------|------|------|
| I. Explicit MVC Layers and Pure Domain Logic | Pass / N/A | This feature changes CI, static hosting, and maintainer documentation; it adds no application domain or persistence logic. |
| II. Validate at Boundaries with Zod | Pass / N/A | No new application boundary is introduced. Validate the existing Vite build output and workflow inputs through the documented build and GitHub event conditions. |
| III. Represent Domain Errors Explicitly | Pass / N/A | No domain or transport errors are added. Failed workflow steps remain failed; deploy depends on successful build and artifact creation. |
| IV. Tests and Quality Gates | Pass | Validate the build with the Pages base override and run the existing typecheck/test gates for any frontend configuration changes. Inspect the artifact and workflow conditions. |
| V. Security by Default | Pass | PR jobs receive read-only repository permission and cannot deploy. Only the deploy job receives Pages write and OIDC token permissions. The artifact includes only built static files and no secrets. |
| VI. Embedded SQLite Persistence | Pass / N/A | The workflow and static site do not add or modify operational persistence. |

**Gate result**: PASS. No constitutional exception is required.

## Phase 0: Research

See [research.md](./research.md). Official GitHub Pages documentation confirms
the requested artifact/deploy actions, deploy-job permission requirements,
environment URL output, and recommended major versions. A local build verified
that Vite accepts `--base=/ops-pilot/` while retaining the existing default
configuration for other commands.

## Phase 1: Design & Contracts

- [Data model](./data-model.md): workflow executions, static artifact, and
  publication configuration.
- [Workflow contract](./contracts/pages-workflow.md): triggers, branch gating,
  permissions, artifact contents, concurrency, and deploy output.
- [Quickstart](./quickstart.md): local Pages-base build, preview checks,
  repository configuration, and deployment verification.

**Post-design Constitution Check**: PASS. The separate deployment job restricts
publishing permissions to approved refs, the build artifact is limited to
`web/dist`, and the README documents that API CORS and API deployment remain
separate.

## Project Structure

### Documentation (this feature)

```text
specs/018-github-pages-deploy/
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   └── pages-workflow.md
├── quickstart.md
└── tasks.md
```

### Source and workflow (repository root)

```text
.github/
└── workflows/
    └── deploy-pages.yml       # PR validation and gated Pages publication

web/
└── vite.config.ts             # Existing default retained; CI overrides base
                               # with /ops-pilot/ for Pages builds

README.md                      # Public URL, setup, operation, local checks, CORS
```

**Structure Decision**: Keep the current single Vite frontend and build it with
a command-line base override in the Pages workflow; do not change the default
`/opspilot/` used by the existing local web flow. Build and deploy are separate
jobs so that the Pages permissions are unavailable to PR code. Upload only the
generated static directory. The workflow file and README are the only planned
repository changes outside this feature's specification artifacts.

## Complexity Tracking

No constitutional violations or additional projects.
