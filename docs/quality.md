# Quality Baseline

PontoSys uses a lightweight build-and-smoke baseline. The goal is to catch broken routes, missing demo data, and production build regressions without adding a heavy test framework.

## Commands

```bash
npm run build
npm run smoke
npm run a11y:smoke
npm run workflow:smoke
npm run check
```

- `npm run build` runs the Next.js production build.
- `npm run smoke` checks known page and API routes against a running local server.
- `npm run a11y:smoke` checks representative server-rendered pages for baseline accessibility and page structure.
- `npm run workflow:smoke` checks multi-step API contracts against a running local server.
- `npm run check` runs `build`, starts `next start`, waits for `/api/health`, runs the smoke, accessibility, and workflow checks, and stops the server.

## Local Server

The smoke runner expects PontoSys at `http://localhost:3000` by default.

For an existing dev or production server:

```bash
npm run dev
npm run smoke
npm run a11y:smoke
npm run workflow:smoke
```

For a different host or port:

```bash
PONTOSYS_BASE_URL=http://localhost:4000 npm run smoke
PONTOSYS_BASE_URL=http://localhost:4000 npm run a11y:smoke
PONTOSYS_BASE_URL=http://localhost:4000 npm run workflow:smoke
```

The `check` runner starts its own production server on port `3100`, which avoids the default dev server port. Override the port when needed:

```bash
PONTOSYS_CHECK_PORT=4000 npm run check
```

## Smoke Coverage

Smoke checks live in `scripts/smoke-manifest.mjs`. Each entry has:

- `path`: a page or API route to request.
- `text`: a stable string expected in the response body.
- `method`, `body`, and `headers`: optional request details for API smoke checks.
- `expectedStatus`: optional exact response status when a check should prove a non-2xx result.

Add a route to the manifest when a new user-facing page or stable API endpoint is introduced. Prefer strings that describe durable page headings, API keys, or seed data. Avoid checking volatile counts, timestamps, or UI copy that is likely to change during feature work.

The runner in `scripts/smoke.mjs` intentionally stays simple: it sends requests, requires a successful status unless `expectedStatus` is set, and checks response text. Mutation smoke checks should stay narrow and focus on stable authorization or validation behavior.

## Accessibility Smoke Coverage

Accessibility smoke checks live in `scripts/a11y-smoke.mjs`. The runner fetches representative pages from `PONTOSYS_BASE_URL` and verifies lightweight server-rendered structure:

- `<html lang>` and document `<title>`.
- One or more `<main>` landmarks and an `<h1>`.
- A `<nav>` landmark on authenticated app pages.
- Accessible labels for rendered inputs, selects, textareas, and buttons through wrapping labels, `for`/`id`, visible button text, or ARIA naming attributes.

This is not a replacement for assistive technology QA or browser interaction tests. Keep it fast and dependency-free so it can run as part of `npm run check`.

## Workflow Smoke Coverage

Workflow smoke checks live in `scripts/workflow-smoke.mjs`. The runner is dependency-free and expects a running server through `PONTOSYS_BASE_URL`.

Current workflows:

- Create a rider with a unique value for the check run, then verify the detail endpoint returns masked CPF/PIX by default and revealed CPF/PIX with an authorized reveal request.
- Create a reward rule, verify a `Leader` role cannot mutate it, update it with `Super Admin`, and confirm the collection reflects the update.
- Create and update ponto, leader, incident, and finance ledger records while verifying role-denied mutation paths for each area.

Workflow-created rider and reward records are deleted before the runner exits. Other current APIs do not yet expose delete endpoints, so those workflow records remain process-local and disappear when the `npm run check` production server stops. Keep new workflow checks self-contained: create their own data, address records by response IDs, and clean up when the API supports deletion.

## Current Gaps

- No unit tests for app library logic, data transformations, or permissions.
- No browser interaction tests for forms, navigation flows, or client-side state.
- Accessibility coverage is limited to lightweight server-rendered structure checks; there are no visual regression or performance budgets.
- Workflow smoke covers the main API mutation surfaces, but broader browser form flows and client-side store interactions are still untested.
