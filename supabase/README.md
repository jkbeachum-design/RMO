# Supabase migrations

SQL under `migrations/` is applied in order (`001` … `006` today). Prefer the Supabase SQL editor or CLI; keep RLS policies as defense in depth.

## Data API grants (required after Oct 30, 2026)

New `public` tables are **not** auto-granted to PostgREST roles. Every `CREATE TABLE` in `public` must include the grants below (idempotent `GRANT` is fine). Without them, preview branches and `supabase db reset` leave tables unreachable via the Data API / supabase-js.

Live project tables already have these grants; do **not** ship a production-only re-grant migration unless SQL history is missing them for reset fidelity.

```sql
grant select on public.your_table to anon;
grant select, insert, update, delete on public.your_table to authenticated;
grant select, insert, update, delete on public.your_table to service_role;
```

Copy-paste scaffold: [`migrations/_TEMPLATE_create_table.sql`](./migrations/_TEMPLATE_create_table.sql).

Keep RLS enabled and policies unchanged — grants only make the table reachable; policies still decide which rows.
