-- TEMPLATE only — do not apply as a numbered migration.
-- After Oct 30, 2026, every new public table needs explicit Data API grants.
-- Replace your_table, then copy the CREATE + GRANT block into the next numbered migration.

-- CREATE TABLE IF NOT EXISTS public.your_table (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid()
--   -- ...
-- );

grant select on public.your_table to anon;
grant select, insert, update, delete on public.your_table to authenticated;
grant select, insert, update, delete on public.your_table to service_role;

-- ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY ... (RLS still required; grants alone do not expose rows)
