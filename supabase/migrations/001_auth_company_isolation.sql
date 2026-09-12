-- RMO Compliance — auth + company isolation
-- Apply in Supabase SQL editor (or via CLI) before enabling multi-tenant production use.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where practical.

-- ---------------------------------------------------------------------------
-- 1. Extend users for password auth + optional Supabase Auth link
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- license_id on users remains as a "home" license hint; memberships are authoritative.
ALTER TABLE public.users
  ALTER COLUMN license_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_user_email_lower_idx
  ON public.users (lower(user_email));

-- ---------------------------------------------------------------------------
-- 2. Membership: which companies/licenses a user may access (and as what role)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('RMO', 'OPERATOR', 'ADMIN', 'PM', 'FOREMAN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, license_id, role)
);

CREATE INDEX IF NOT EXISTS user_licenses_user_id_idx ON public.user_licenses (user_id);
CREATE INDEX IF NOT EXISTS user_licenses_license_id_idx ON public.user_licenses (license_id);

COMMENT ON TABLE public.user_licenses IS
  'Authoritative company/license membership. Dashboard and APIs must scope all reads/writes to these rows.';

-- ---------------------------------------------------------------------------
-- 3. Pilot membership backfill (Beachum 836089 + Vanguard 1160775)
--    Links existing users by email/license_id when present.
--
-- Pilot roster (seed/backfill targets; create users rows separately if missing):
--   Jonathan Beachum <jbeachum@buildmyoffice.com>
--     — sole prop / RMO on Beachum Construction (836089)
--     — RMO on Vanguard Property Maintenance (1160775)
--   Eric <ERICJ379@gmail.com>
--     — company principal / ADMIN on Vanguard (1160775)
-- ---------------------------------------------------------------------------

-- Correct legacy pilot email if an older seed used jonathan@buildmyoffice.com
UPDATE public.users
SET user_email = 'jbeachum@buildmyoffice.com',
    user_name = COALESCE(NULLIF(trim(user_name), ''), 'Jonathan Beachum'),
    updated_at = now()
WHERE lower(user_email) = 'jonathan@buildmyoffice.com';

INSERT INTO public.user_licenses (user_id, license_id, role)
SELECT u.id, u.license_id, COALESCE(NULLIF(upper(u.role), ''), 'OPERATOR')
FROM public.users u
WHERE u.license_id IS NOT NULL
ON CONFLICT (user_id, license_id, role) DO NOTHING;

-- Jonathan Beachum: RMO on both pilot licenses when the user + licenses exist
INSERT INTO public.user_licenses (user_id, license_id, role)
SELECT u.id, l.id, 'RMO'
FROM public.users u
CROSS JOIN public.licenses l
WHERE lower(u.user_email) = 'jbeachum@buildmyoffice.com'
  AND l.license_number IN ('836089', '1160775')
ON CONFLICT (user_id, license_id, role) DO NOTHING;

-- Eric: ADMIN on Vanguard when the user + license exist
INSERT INTO public.user_licenses (user_id, license_id, role)
SELECT u.id, l.id, 'ADMIN'
FROM public.users u
CROSS JOIN public.licenses l
WHERE lower(u.user_email) = 'ericj379@gmail.com'
  AND l.license_number = '1160775'
ON CONFLICT (user_id, license_id, role) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Helper: license ids for the current auth.uid() (Supabase Auth path)
--    App also enforces membership in Next.js; RLS is defense-in-depth.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users
  WHERE auth_user_id = auth.uid()
     OR lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_has_license_access(p_license_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_licenses ul
    WHERE ul.license_id = p_license_id
      AND ul.user_id = public.current_app_user_id()
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security (enable after reviewing policies)
--    Service-role (backend jobs / Retell) bypasses RLS — keep that key server-only.
--    Anon/authenticated clients should use these policies.
-- ---------------------------------------------------------------------------
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_audit_reports ENABLE ROW LEVEL SECURITY;

-- Drop prior policies if re-applying
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'licenses', 'users', 'user_licenses', 'compliance_logs',
        'projects', 'subcontractors', 'monthly_audit_reports'
      )
      AND policyname LIKE 'rmo_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- user_licenses: members see their own rows
CREATE POLICY rmo_user_licenses_select ON public.user_licenses
  FOR SELECT TO authenticated
  USING (user_id = public.current_app_user_id());

-- users: can read self
CREATE POLICY rmo_users_select_self ON public.users
  FOR SELECT TO authenticated
  USING (id = public.current_app_user_id());

-- licenses: only memberships
CREATE POLICY rmo_licenses_select ON public.licenses
  FOR SELECT TO authenticated
  USING (public.user_has_license_access(id));

CREATE POLICY rmo_compliance_logs_select ON public.compliance_logs
  FOR SELECT TO authenticated
  USING (public.user_has_license_access(license_id));

CREATE POLICY rmo_compliance_logs_update ON public.compliance_logs
  FOR UPDATE TO authenticated
  USING (public.user_has_license_access(license_id))
  WITH CHECK (public.user_has_license_access(license_id));

CREATE POLICY rmo_projects_select ON public.projects
  FOR SELECT TO authenticated
  USING (public.user_has_license_access(license_id));

CREATE POLICY rmo_subcontractors_select ON public.subcontractors
  FOR SELECT TO authenticated
  USING (public.user_has_license_access(license_id));

CREATE POLICY rmo_monthly_audit_select ON public.monthly_audit_reports
  FOR SELECT TO authenticated
  USING (public.user_has_license_access(license_id));

CREATE POLICY rmo_monthly_audit_upsert ON public.monthly_audit_reports
  FOR ALL TO authenticated
  USING (public.user_has_license_access(license_id))
  WITH CHECK (public.user_has_license_access(license_id));
