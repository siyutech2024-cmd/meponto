# MVP Gap Analysis

Status after the current implementation pass: the main MVP module surface exists, and the P1 interaction gaps are now closed. Remaining work is mostly production hardening and real external integrations.

## Remaining Task Count

Total remaining tasks: 4

## Completed In Latest Parallel Pass

- Auth closure: `/reset-password`, demo login API, reset API, login API wiring.
- Ponto operations: functional Add Ponto flow.
- Leader operations: functional Add Leader flow.
- Notification operations: mark as read / acknowledge, notification API, audit event.
- Rider detail actions: Edit Profile, Update Vehicle, Change Leader, Move Ponto.
- Incident detail actions: Call Rider, Call Emergency Contact, Request Tow Truck, Close Incident state.
- Reward rules management: Add Rule and Edit Rule mutate persisted UI/store rules.
- Server-side RBAC enforcement: mutation API routes check `x-vento-role` against the permission matrix while keeping demo defaults compatible.
- Sensitive field protection: rider detail masks CPF/PIX by default and requires an explicit reveal action gated by role permissions.
- Server-side sensitive masking: rider API reads mask CPF/PIX by default and require an explicit reveal header plus an authorized role.
- Dedicated sensitive reveal endpoint: `/api/riders/:id/sensitive` requires an explicit authorized role, returns only CPF/PIX identity fields, and records server audit entries for both allowed and denied access.
- Deeper smoke coverage: mutation checks now cover expected status codes, custom role headers, RBAC denial, and reward-rule updates.
- Reward rule API update: `/api/rewards/[id]` supports permission-checked PUT and DELETE.
- Integration readiness skeleton: provider contracts and `/api/integrations` expose maps, object storage, PIX/payout, and SMS/email readiness without external calls.
- Native communication: the former external messaging surface has been replaced with PontoSys in-app chat rooms, broadcasts, message previews, and a native chat API.
- Accessibility smoke checks: `npm run check` now includes a dependency-free server-rendered page structure pass.
- Server audit trail: forbidden permission attempts and rider sensitive reveal attempts append in-memory server audit entries exposed by `/api/audit`.
- Repository migration prep: `app/lib/server/repositories.ts` provides a typed facade over current process-local collections for incremental PostgreSQL migration.
- Workflow smoke checks: `npm run check` now validates multi-step rider masking/reveal plus reward, ponto, leader, incident, and finance mutation contracts.
- Broader API error-path smoke: validation and authorization failures now cover sensitive reveal, riders, pontos, leaders, incidents, finance, rewards, CRM, import/export tools, notifications, and settings.

## Remaining P2 / Production Hardening

1. Durable backend migration: replace process-local memory and browser-only state with NestJS/PostgreSQL/Redis.
2. Sensitive data protection hardening: encryption-at-rest design and durable audit persistence.
3. Deeper tests: browser workflow tests, unit tests for shared logic, and visual/performance budgets.
4. Real integrations: map provider, S3 uploads, payout/PIX provider, SMS/email providers, and webhook processing.

## Notes

- `npm run check` is the current quality gate.
- `docs/schema.sql`, `docs/api.md`, and `docs/architecture.md` define the backend migration target.
- When a new route or endpoint is added, update `scripts/smoke-manifest.mjs`.
