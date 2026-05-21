# meponto PontoSys MVP Backend Architecture Handoff

## Scope

PontoSys MVP is currently a Next.js app with API route handlers under `app/api/*` and shared demo data under `app/lib/*`. Runtime state is in memory for the server API and in browser storage for the client Zustand store. This document is a backend handoff for preserving the current behavior while preparing a move to NestJS, PostgreSQL, and Redis.

## Current Modules

| Area | Current files | Responsibility |
| --- | --- | --- |
| Server memory store | `app/lib/server/memory.ts` | Initializes process-local collections from seed data and returns `no-store` JSON responses. |
| Seed domain data | `app/lib/data.ts` | Riders, pontos, leaders, incidents, rewards, finance ledger entries, and core TypeScript domain types. |
| CRM partners | `app/lib/crm.ts` | Partner shop, supplier, and vehicle partner records plus category/status/risk types. |
| WhatsApp groups | `app/lib/whatsapp.ts` | Group coverage, sync, alert, and leader routing data. |
| Settings | `app/lib/settings.ts` | Demo settings for incentives, incident SLA, notifications, night shift, and security. |
| RBAC | `app/lib/rbac.ts` | Static roles, permissions, labels, and the `can(role, permission)` helper. |
| Analytics | `app/lib/analytics.ts` | Derived network, rider risk, and ponto risk metrics. |
| Security posture | `app/lib/security.ts` | Demo login audit, readiness checks, RBAC risk checks, and security summary. |
| Integration readiness | `app/lib/integrations.ts` | Typed provider skeletons for WhatsApp, maps, object storage, PIX/payout, and SMS/email. Checks required environment variable presence without external calls. |
| Client store | `app/lib/store.ts` | Zustand persisted browser state used by some pages for demo mutations and audit entries. |
| Repository prep | `app/lib/server/repositories.ts` | Typed repository/service facade over the current process-local collections. It is available for incremental route migration and keeps memory as the backing store for now. |

## API Route Shape

All server API routes return JSON. List endpoints usually return `{ data: [...] }`; aggregate endpoints may include a `summary` or `totals` field. Mutating routes update only the process-local `memory` object.

| Route | Methods | Backing collection |
| --- | --- | --- |
| `/api/health` | `GET` | Static health response |
| `/api/riders` | `GET`, `POST` | `memory.riders` |
| `/api/riders/:id` | `GET`, `PUT`, `DELETE` | `memory.riders` |
| `/api/riders/:id/sensitive` | `GET` | `memory.riders` |
| `/api/pontos` | `GET`, `POST` | `memory.pontos` |
| `/api/pontos/:id` | `PUT` | `memory.pontos` |
| `/api/leaders` | `GET`, `POST` | `memory.leaders` |
| `/api/leaders/:id` | `PUT` | `memory.leaders` |
| `/api/incidents` | `GET`, `POST` | `memory.incidents` |
| `/api/incidents/:id` | `PUT` | `memory.incidents` |
| `/api/rewards` | `GET`, `POST` | `memory.rewards` |
| `/api/rewards/:id` | `PUT`, `DELETE` | `memory.rewards` |
| `/api/finance` | `GET`, `POST` | `memory.ledgerEntries` |
| `/api/finance/:id` | `PUT` | `memory.ledgerEntries` |
| `/api/crm` | `GET`, `POST` | `memory.crmPartners` |
| `/api/whatsapp` | `GET`, `POST` | `memory.whatsappGroups` |
| `/api/settings` | `GET`, `POST` | `memory.systemSettings` |
| `/api/integrations` | `GET` | Environment readiness derived from `app/lib/integrations.ts` |
| `/api/analytics` | `GET` | Derived from riders and incidents |
| `/api/access-control` | `GET` | Static RBAC matrix |
| `/api/security` | `GET` | Static security posture |
| `/api/audit` | `GET` | Bootstrap audit response plus in-memory server audit entries |

See `docs/api.md` for request and response examples.

## Repository Abstraction

`app/lib/server/repositories.ts` introduces a typed repository boundary without changing route behavior. The exported `repositories` registry wraps the same arrays exposed by `app/lib/server/memory.ts`, so `all`, `findById`, `insert`, `update`, and `delete` preserve the current process-local semantics. Routes can continue importing `memory` directly until each handler is migrated.

The wrapper covers riders, incidents, pontos, leaders, rewards, finance ledger entries, notifications, CRM partners, WhatsApp groups, system settings, and in-memory server audit entries. `repositoryServices` also exposes the smallest service facade requested for riders, rewards, and audit. This gives the PostgreSQL migration a stable interface target while avoiding a broad route rewrite in the MVP.

When PostgreSQL is introduced, keep the repository method signatures stable and replace the in-memory implementation behind `createMemoryRepositories` with database-backed adapters. Route contracts should stay unchanged during that swap: the route layer should continue to own response envelopes, masking decisions, RBAC checks, and HTTP status codes, while repositories own persistence and lookup semantics.

## RBAC Baseline

The MVP has six static roles:

| Role | Permissions |
| --- | --- |
| Super Admin | All permissions, including `reset_demo`. |
| Regional Manager | Dashboard, riders, pontos, leaders, incidents, rewards, analytics, audit. |
| Ponto Manager | Dashboard, riders, incidents, rewards, analytics. |
| Leader | Dashboard, create incidents, analytics. |
| Finance | Dashboard, rewards, finance, analytics, audit. |
| Support | Dashboard, incidents, analytics, audit. |

Current permissions are `view_dashboard`, `manage_riders`, `manage_pontos`, `manage_leaders`, `create_incidents`, `close_incidents`, `manage_rewards`, `view_finance`, `view_analytics`, `view_audit`, and `reset_demo`.

Mutation API route handlers now enforce the static RBAC matrix through `x-vento-role`. Requests without a role header default to `Super Admin` to preserve demo smoke behavior. Production APIs should replace this demo header with authenticated actor resolution, add resource-level ownership checks, and record durable audit events for sensitive mutations.

## In-Memory Limitations

- Server API writes are process-local and disappear on server restart, redeploy, or worker replacement.
- Horizontal scaling will split state between processes unless a shared datastore is introduced.
- Client Zustand state is persisted separately in browser storage and can diverge from server API memory.
- IDs are timestamp/count strings and are not collision-proof under concurrent writes.
- There are no transactions, uniqueness constraints, row-level authorization, or durable audit logs. Current server audit entries are process-local only.
- Sensitive fields such as CPF and PIX are stored as plain demo strings in memory, but rider API reads mask them by default. The dedicated `/api/riders/:id/sensitive` endpoint requires an explicit role with `manage_riders` or `view_finance` and records an in-memory server audit entry for allowed and denied reveal attempts. The legacy reveal header remains for compatibility.
- Read models and counters, such as `ridersCount`, `incidentCount`, and finance totals, can drift because they are not transactionally maintained.

## Migration Path

1. Introduce a NestJS backend with modules matching the bounded contexts: `RidersModule`, `PontosModule`, `LeadersModule`, `IncidentsModule`, `RewardsModule`, `FinanceModule`, `CrmModule`, `WhatsappModule`, `SettingsModule`, `AnalyticsModule`, `AuditModule`, and `AuthzModule`.
2. Migrate Next.js API routes gradually from direct `memory` access to the typed repositories in `app/lib/server/repositories.ts`, keeping response envelopes, masking, and status codes unchanged.
3. Add PostgreSQL using the schema in `docs/schema.sql`. Start with normalized tables for source-of-truth records, reference lookup tables for roles/permissions, and append-only audit/ledger records.
4. Swap repository implementations from process-local arrays to PostgreSQL adapters, then move current route contracts behind NestJS controllers. Keep response envelopes compatible with the MVP while adding DTO validation and typed error responses.
5. Enforce authentication and RBAC in NestJS guards. Use a permission guard per route, with resource-level ownership checks for leader and ponto-manager scopes.
6. Use PostgreSQL transactions for incident creation, ledger status changes, rider status changes, and audit writes.
7. Use Redis for cache, queues, and ephemeral coordination: analytics cache, rate limits, login throttles, WhatsApp sync jobs, notification fanout, and idempotency keys.
8. Introduce background workers for WhatsApp sync, partner SLA checks, finance payout workflows, and audit export jobs.
9. Replace demo counters with database views/materialized views or transactional projection tables. Invalidate Redis caches after writes.
10. Add field-level protection for CPF and PIX: encryption at rest, masked read DTOs, limited reveal endpoints, and audit events for access.
11. Retire browser-only mutation paths by making pages call API endpoints consistently, then remove divergent Zustand persistence for source-of-truth data.

## Production Readiness Notes

- Treat `audit_logs` as append-only and write from every privileged mutation.
- Treat `ledger_entries` as append-only for money movement. Prefer status transitions and compensating entries over destructive edits.
- Add optimistic locking or `updated_at` checks to mutable operational records.
- Use idempotency keys for payout, incident intake, and WhatsApp broadcast APIs.
- Keep analytics derived. Avoid letting dashboard calculations become hidden source-of-truth fields.
