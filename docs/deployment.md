# Production Deployment: GitHub + Supabase + Vercel

## Current State

The Next.js dashboard is deployed from `siyutech2024-cmd/meponto` to the
Vercel project `meponto`. The current API still uses process-local demo memory.
Supabase configuration is the first step toward durable repositories.

## Environment Model

Use separate Vercel and Supabase environments. Preview deployments must never
write to the production database.

| Purpose | Git branch | Vercel environment | Supabase project |
| --- | --- | --- | --- |
| Local development | feature branch | Development | `meponto-sandbox` |
| Sandbox review | pull request branch | Preview | `meponto-sandbox` |
| Live product | `main` | Production | `meponto-production` |

## 1. Create The Supabase Projects

Create two Supabase projects:

1. `meponto-sandbox` for local development and Vercel Preview deployments.
2. `meponto-production` for the live `main` branch only.

In each project's SQL Editor, run `docs/schema.sql` once to create the initial
tables, indexes, roles, and permissions.

## 2. Add Vercel Environment Variables

In each Supabase project, open Project Settings > API and Project Settings >
Database. Add the sandbox values to Vercel Preview and Development. Add the
production values to Vercel Production only.

| Vercel variable | Supabase source |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role secret |
| `DATABASE_URL` | pooled Postgres connection string |

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` with a
`NEXT_PUBLIC_` prefix.

## 3. Create A Sandbox Preview

Create a feature branch and push it to GitHub:

```bash
git switch -c codex/<change-name>
git push -u origin codex/<change-name>
```

Open a pull request into `main`. When the Vercel Git integration is enabled,
Vercel creates a Preview URL for the pull request automatically. To create a
Preview manually from the current branch:

```bash
npx vercel
```

Validate the Preview URL and its health endpoint before merging.

If pull requests do not receive Preview deployments automatically, open the
Vercel project dashboard and connect `siyutech2024-cmd/meponto` under
Settings > Git. Grant the Vercel GitHub App access to the repository when
GitHub asks for confirmation.

## 4. Sync Database Schema Changes

Create incremental SQL migrations for schema changes:

```bash
npx supabase migration new <change_name>
```

Apply and verify the migration in `meponto-sandbox` first. After review, apply
the same committed migration to `meponto-production`. Do not copy sandbox
records into production unless a specific data migration has been reviewed.

## 5. Release To Production

Merge the reviewed pull request into `main`. The Vercel Git integration should
deploy `main` to Production automatically. For an intentional manual release:

```bash
git switch main
git pull --ff-only origin main
npx vercel --prod
```

Do not run `npx vercel --prod` from an unmerged feature branch.

## 6. Verify The Production Deployment

```bash
curl -fsSL https://meponto.vercel.app/api/health
```

Expected configuration signal:

```json
{
  "production": {
    "persistence": "configured",
    "supabase": {
      "configured": true,
      "missingEnv": []
    }
  }
}
```

This confirms that Vercel can see the Supabase settings. It does not switch
the API from demo memory to PostgreSQL yet; database-backed adapters remain a
separate implementation step.
