# MePonto PR Checklist

Use this checklist before asking another developer to review a change.

## Scope

- [ ] The PR changes one clear module or one clear shared capability.
- [ ] Shared code changes are explained.
- [ ] No unrelated formatting or refactor is included.

## Architecture

- [ ] Module boundary is respected.
- [ ] No direct private data access across modules.
- [ ] New module has a contract document or updated module notes.
- [ ] Feature flag is used for new capability.

## Permissions And Risk

- [ ] RBAC/scope checks are applied.
- [ ] Sensitive data is masked where needed.
- [ ] Money, incentives, stock, points, or settlement use ledger-style records.
- [ ] Points-related changes follow `docs/meponto-points-economy-standard.md`.
- [ ] Audit trail is included for sensitive actions.

## Data And Events

- [ ] API contracts are documented.
- [ ] Events are versioned.
- [ ] Read model or dashboard impact is considered.
- [ ] Migration or data compatibility risk is explained.

## Localization

- [ ] Chinese text is complete.
- [ ] English text is complete.
- [ ] Portuguese text is complete.
- [ ] Brand names are correct: MePonto and PontoSys.

## Verification

- [ ] `npm run codex:preflight` passes.
- [ ] `npm run codex:preflight:full` passes for release or high-risk changes.
- [ ] Relevant smoke/manual test is completed.
- [ ] Screenshots are attached for UI changes when useful.
