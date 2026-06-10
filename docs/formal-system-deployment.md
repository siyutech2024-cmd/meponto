# MePonto Formal System Deployment

This repository stays as one Next.js/Vercel project so each module can be maintained independently while sharing the same Supabase database and design system.

## Current Vercel Mapping

Use these paths on the current Vercel deployment first:

| System | Vercel path | Test account | Password | Role |
| --- | --- | --- | --- | --- |
| PontoSys main backend | `/pontosys` | `hq@meponto.com` | `pontosys-hq` | Super Admin |
| Franchise backend | `/franchise-admin` | `franchise@meponto.com` | `franquia-demo` | Franchise Admin |
| Ponto station backend | `/ponto-admin` | `ponto@meponto.com` | `ponto-demo` | Ponto Manager |
| MePonto rider app | `/app` | `rider@meponto.com` | `rider-demo` | Rider |
| PontoMall | `/pontomall` | `mall@meponto.com` | `pontomall-demo` | Mall Operator |
| Partner service point | `/partner-app` | `partner@meponto.com` | `partner-demo` | Partner Operator |
| Supplier backend | `/supplier-admin` | `supplier@meponto.com` | `supplier-demo` | Supplier Admin |

## Future Domain Mapping

When `meponto.com` is ready, add these domains to the same Vercel project:

| Domain | System | Root behavior |
| --- | --- | --- |
| `sys.meponto.com` | PontoSys main backend | `/` rewrites to `/pontosys` |
| `franchise.meponto.com` | Franchise backend | `/` rewrites to `/franchise-admin` |
| `station.meponto.com` | Ponto station backend | `/` rewrites to `/ponto-admin` |
| `app.meponto.com` | MePonto rider app | `/` rewrites to `/app` |
| `partner.meponto.com` | Partner service point | `/` rewrites to `/partner-app` |
| `supplier.meponto.com` | Supplier backend | `/` rewrites to `/supplier-admin` |
| `mall.meponto.com` | PontoMall | `/` rewrites to `/pontomall` |
| `meponto.com` / `www.meponto.com` | Rider-facing default | `/` rewrites to `/app` |

The host rewrite is implemented in `middleware.ts`.

## Supabase Setup

Required Vercel environment variables:

```bash
NEXT_PUBLIC_APP_NAME="MePonto"
NEXT_PUBLIC_APP_ENV="production"
NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
DATABASE_URL="<supabase-pooled-postgres-url>"
DIRECT_URL="<supabase-direct-postgres-url>"
```

Run Supabase migrations before switching production data from memory to durable tables:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

The formal portal migration adds:

- `app_portals`
- `app_test_accounts`
- `franchises`
- `rider_slots`
- `slot_enrollments`
- New roles and permissions for franchise, rider app, PontoMall, and slot scheduling

## Module Maintenance Boundaries

Keep each module in its own page/API surface:

- PontoSys: `/pontosys`, `/dashboard`, `/reports`, `/access-control`, `/security`, `/audit`
- Franchise backend: `/franchise-admin`, `/franchise`, `/slot-enrollment`, franchise-scoped reports
- Ponto station backend: `/ponto-admin`, `/slot-enrollment`, `/pontos`, `/riders`, `/incidents`
- Rider app: `/app`, `/rider-app`, rider-facing PontoMall views
- PontoMall: `/pontomall`, `/marketplace`, `/points-economy`, `/partner-points`, `/crm`

Do not duplicate business logic per portal. Add shared functions under `app/lib/<module>.ts`, and keep portal routing/labels in `app/lib/portals.ts`.
