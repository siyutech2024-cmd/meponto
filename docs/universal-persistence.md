# Universal Database Persistence (app_state_records)

Status: active. Added 2026-06-10.

## Problem it solves

Previously only auth, slots and operations-core wrote to Supabase. Every other
module (riders, incidents, pontos, leaders, rewards, finance, CRM, chat,
notifications, settings, points, marketplace, partner services, audit) kept its
data in two volatile places: the browser zustand store (localStorage) and the
server in-memory `memory` object. Add buttons appeared to work, but data never
reached the database and was lost on server restart or on another device.

## How it works now

1. **Client → server.** Every store action in `app/lib/store.ts` performs its
   optimistic local update and then mirrors the mutation to the matching API
   route via `app/lib/sync.ts` (`syncToServer`). POST routes accept the
   client-generated id (`acceptClientId`) so browser, server and database share
   one id per record. `app/components/store-hydrator.tsx` reloads the
   database-backed state into the browser store on app start.

2. **Server → database.** `app/lib/server/persistence.ts` wraps every
   collection of `app/lib/server/memory.ts` in a mutation-tracking Proxy.
   Any unshift/push/splice/index assignment marks the collection dirty; a
   debounced flusher (300 ms) upserts the full collection into the Supabase
   table `app_state_records` (one JSONB row per record, key =
   `collection + record_id`) and deletes rows that no longer exist in memory.

3. **Database → server.** On boot (`instrumentation.ts` imports the memory
   module) `hydrateFromDatabase()` loads all persisted rows and replaces the
   seed contents, so data survives restarts and deployments. Collections with
   no rows yet push their seeds so the database mirrors what users see.

4. **Health.** `GET /api/health` exposes
   `persistence: { enabled, hydrated, trackedCollections, pendingCollections }`.

## Requirements

- Migration `supabase/migrations/20260610120000_app_state_persistence.sql`
  must be applied (Supabase Dashboard → SQL editor, or `supabase db push`).
- `.env.local` needs `USE_SUPABASE=true`, `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`. Without them the app still runs, memory-only.

## Verification

```bash
npm run dev          # terminal 1
node scripts/verify-persistence.mjs   # terminal 2
```

The script creates a rider through the API, confirms the row appears in
`app_state_records`, deletes it, and confirms the delete propagates.

## Notes and boundaries

- `app_state_records` is service-role only (RLS enabled, no policies).
- Rider CPF/PIX are stored as part of the record JSON; the REST/UI layer keeps
  masking them for roles without reveal permission. A move to the encrypted
  relational columns remains possible later — the relational schema from the
  earlier migrations is untouched.
- Slots, operations-core and auth keep their existing dedicated Supabase
  tables and RPCs; their collections are also mirrored but the dedicated
  tables stay the source of truth for those modules.
- The profit model page (`/finance/model`) intentionally keeps its what-if
  scenarios in localStorage only — they are calculator inputs, not operational
  records.
