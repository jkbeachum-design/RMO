-- Account settings: user phone (column already exists in prod as phone_number; idempotent) + explicit grants.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_number text;
COMMENT ON COLUMN public.users.phone_number IS 'User-editable phone (Settings > Account). CEO may edit phone only; name edits are RMO-only (enforced in /api/account).';

GRANT SELECT ON public.users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO service_role;
