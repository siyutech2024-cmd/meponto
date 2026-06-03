# Initial Supabase Migration

The first production schema is maintained in `docs/schema.sql`.

Apply it once from the Supabase SQL Editor before enabling database-backed
repositories. Keep future incremental SQL changes in this directory as
timestamped migration files generated with:

```bash
npx supabase migration new <change_name>
```
