# MePonto Codex Collaboration Rules

This repository is the source of truth for MePonto development rules. Every Codex agent and every developer must follow these rules before changing code.

## Product Context

- Brand: MePonto.
- Main platform name: PontoSys.
- Supported languages: Chinese, English, and Portuguese.
- The system includes master admin, franchise, leader, rider app, and future partner, supply chain, points mall, and gamification systems.
- The platform must be designed as an ecosystem OS, not as isolated pages.

## Required Reading

Before adding or changing a module, read:

- `docs/meponto-ecosystem-development-standard-v2.md`
- `docs/meponto-ecosystem-os-v2-diagram.md`
- `docs/module-development-playbook.md`
- `docs/module-contract-template.md`
- `docs/pr-checklist.md`
- `docs/codex-team-collaboration-manual.md`

## Hard Rules

1. New modules must be registered through the Module Registry design before they become active.
2. A module must not directly read or write another module's private data.
3. Cross-module communication must use an API, event, read model, or Integration Gateway.
4. New business capability must start behind a feature flag and default to disabled or beta.
5. Money, incentives, points, inventory, settlement, and gamification economy changes must use ledger-style records.
6. Permission-sensitive features must use the unified RBAC/scope model.
7. Events must be versioned, for example `marketplace.order.created.v1`.
8. UI text must support Chinese, English, and Portuguese unless the task explicitly says otherwise.
9. Do not introduce a separate login system for a sub-system.
10. Do not rename MePonto or PontoSys without an explicit product decision.

## Team Collaboration

- Work on one module per branch when possible.
- Branch names should use `codex/<module-or-task-name>`.
- Keep `main` deployable.
- Use `dev` or feature branches for integration work.
- Do not make broad refactors while implementing a narrow module task.
- If a change touches shared code, explain why in the PR and ask for review from the owner of that area.

## Module Ownership Areas

- `app/riders`, `app/leaders`, `app/mobile`: rider and leader experience.
- `app/franchise`, `app/finance`: franchise and business model.
- `app/sops`, `docs`, `public/sop-assets`: SOP and training content.
- `app/lib`, `app/api`, `app/components`: shared platform code and must be changed carefully.

## Definition of Done

A module change is not done until:

- The module boundary is clear.
- Permissions are checked.
- Language support is checked.
- Events and API contracts are documented when applicable.
- `npm run codex:preflight` passes.
- `npm run codex:preflight:full` passes for release or high-risk changes.
- The PR checklist is completed.

Codex can stage and commit only when the developer asks it to do so. Before committing, Codex must run the required preflight and stage only files related to the task.
