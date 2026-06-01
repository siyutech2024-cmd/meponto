# Production Deployment: GitHub + Supabase + Vercel

## Current State

The Next.js dashboard is deployed from `siyutech2024-cmd/meponto` to the
Vercel project `meponto`. The current API still uses process-local demo memory.
Supabase configuration is the first step toward durable repositories.

## 1. Create Or Select The Supabase Project

Open the Supabase dashboard and create or select the production project.
In the SQL Editor, run `docs/schema.sql` once to create the initial tables,
indexes, roles, and permissions.

## 2. Add Vercel Environment Variables

In Supabase, open Project Settings > API and Project Settings > Database.
Add these values to Vercel for Production, Preview, and Development:

| Vercel variable | Supabase source |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role secret |
| `DATABASE_URL` | pooled Postgres connection string |

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` with a
`NEXT_PUBLIC_` prefix.

## 3. Verify The Deployment

Redeploy the latest `main` branch after adding variables:

```bash
npx vercel --prod
```

Then open:

```text
https://meponto.vercel.app/api/health
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
