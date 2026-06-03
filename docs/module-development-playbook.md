# MePonto Module Development Playbook

This playbook explains how three developers using Codex can build different modules without drifting away from the same architecture.

## 1. Daily Working Flow

1. Pull the latest integration branch.

```bash
git checkout dev
git pull origin dev
```

2. Create a task branch.

```bash
git checkout -b codex/<module>-<task>
```

Examples:

```txt
codex/franchise-settlement
codex/rider-onboarding
codex/marketplace-catalog
```

3. Tell Codex the module boundary before it edits.

```txt
Only work on the marketplace module. Do not change auth, rider, franchise, or shared ledger code unless needed. If shared code must change, explain it first.
```

4. Implement the smallest complete slice.

5. Run local checks.

```bash
npm run codex:preflight
```

6. Open a PR into `dev`.

7. Merge `dev` into `main` only after build and smoke checks pass.

## 2. Recommended Team Split

| Developer | Primary Area | Normal Files |
| --- | --- | --- |
| Developer A | Franchise and finance | `app/franchise`, `app/finance`, franchise docs |
| Developer B | Rider, leader, mobile | `app/riders`, `app/leaders`, `app/mobile` |
| Developer C | PontoMall, points, supply chain | future module routes, APIs, docs |

Shared areas need review:

```txt
app/lib
app/api
app/components
docs/meponto-ecosystem-development-standard-v2.md
package.json
```

## 3. What Codex Can Do Well

Codex can safely handle these tasks when the boundary is clear:

- Create module pages, forms, dashboards, tables, and workflows.
- Add API routes that follow an existing repository pattern.
- Generate module contract docs and PR notes.
- Add Chinese, English, and Portuguese copy to existing i18n structures.
- Create seed/mock data for demos.
- Add smoke tests and local validation scripts.
- Refactor repeated UI inside one module.
- Produce SOP pages, manuals, and export-ready documents.
- Check for missing translations, risky cross-module imports, and missing docs.

## 4. What Requires Human Approval

Humans must approve before Codex changes these areas:

- Database schema that affects money, points, incentives, inventory, or settlement.
- Authentication, RBAC, session, and permission logic.
- Ledger behavior.
- Module Registry, Integration Gateway, event bus, and schema registry.
- Production deploy configuration.
- Third-party payment, PIX, or partner platform integration.
- In-app chat permissions, moderation, retention, and audit behavior.
- Major data migration.
- Brand rules, legal terms, and franchise commercial policy.

## 4A. Language Requirements

Every module must treat language support as part of the feature, not as a cleanup task.

Required languages:

```txt
zh: Chinese
en: English
pt: Portuguese
```

Default rules:

- Chinese is the default language for business review and internal policy drafting.
- Portuguese is required for Brazil-facing rider, franchise, leader, training, SOP, and operational workflows.
- English is required for technical consistency, admin labels, and cross-team handoff.
- User-facing labels must not mix languages inside one label unless the term is a brand name or fixed product term.
- Use MePonto for the brand, PontoSys for the operations/franchise/rider system, and PontoMall for the mall system.

Language coverage must include:

- Navigation labels.
- Page titles and section headings.
- Buttons, tabs, filters, forms, placeholders, and helper text.
- Empty states, loading states, error states, and success messages.
- Table headers and status labels.
- API error messages when displayed to users.
- SOP, training, franchise, export, PDF, and HTML content.
- Notification and In-App Chat message templates.

Codex should verify language support before finishing a UI or content task. If a task intentionally ships in one language only, the PR must explain why and list the missing language follow-up.

## 5. New Module Execution Flow

For a new module such as PontoMall:

1. Fill `docs/module-contract-template.md`.
2. Add route and UI behind a feature flag.
3. Define private data tables or mock data.
4. Define API contracts.
5. Define outbound and inbound events.
6. Define permissions.
7. Add read model or dashboard projection if the module needs reporting.
8. Add smoke tests.
9. Enable beta for an internal role or one franchise only.
10. Promote to active after verification.

## 6. Code Sync Rules

- Pull before starting work.
- Push every stable milestone.
- Prefer small PRs.
- Never force push to another developer's branch.
- Never use destructive git commands to resolve conflicts.
- When a conflict appears, keep the module boundary in mind and ask the owner of the other area before editing their logic.

## 7. Suggested Branch Policy

```txt
main: production-ready
dev: integration and staging
codex/<module>-<task>: individual work
```

Merge order:

```txt
codex/* -> dev -> main
```

## 8. Minimal Release Gate

Before going to production:

```bash
npm run codex:preflight:full
```

If `npm run check` is too slow for every small PR, run it before merging `dev` into `main`.

## 9. Codex Submission Rule

Codex can prepare a commit only after the required preflight passes.

Normal module change:

```bash
npm run codex:preflight
```

High-risk or release change:

```bash
npm run codex:preflight:full
```

High-risk changes include:

- Shared platform code.
- API behavior.
- Permissions and security.
- Finance, ledger, rewards, points, inventory, and settlement.
- Module Registry, Integration Gateway, event, realtime, and rule engine changes.

Codex should not auto-commit without a developer request. The recommended instruction is:

```txt
Run the required preflight. If it passes, stage only the files for this task and create a commit with a clear message.
```

## 10. Verification Ownership

| Area | Codex Can Verify Directly | Human Must Confirm |
| --- | --- | --- |
| UI pages | build, smoke path, screenshot/manual browser check | final visual taste and business wording |
| SOP/content | broken links, language completeness, structure | policy accuracy |
| API routes | response smoke tests, permission checks | production data contract |
| i18n | missing copy and brand terms | market-specific phrasing |
| finance/rewards | build and permission smoke | settlement formula and commercial policy |
| auth/RBAC | basic tests and route checks | approval before merge |
| deployments | CI and Vercel build result | production release decision |
