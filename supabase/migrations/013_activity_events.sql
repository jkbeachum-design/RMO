-- Operator portal activity events (app opens, sign-ins, report flow)
-- Data API GRANTs required for new public tables (see 008 / 009 house rules).

CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (
    event IN (
      'app_open',
      'page_view',
      'sign_in',
      'report_started',
      'report_submitted'
    )
  ),
  path text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_events_license_created_idx
  ON public.activity_events (license_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_events_user_created_idx
  ON public.activity_events (user_id, created_at DESC);

COMMENT ON TABLE public.activity_events IS
  'Lightweight CEO/operator portal usage events for RMO oversight. Operators insert own rows; only RMO/ADMIN select.';

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Operators (any license member) may INSERT only their own rows on licenses they belong to.
DROP POLICY IF EXISTS rmo_activity_events_insert ON public.activity_events;
CREATE POLICY rmo_activity_events_insert ON public.activity_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.current_app_user_id()
    AND public.user_has_license_access(license_id)
  );

-- Only RMO/ADMIN members of a license can SELECT its activity rows.
DROP POLICY IF EXISTS rmo_activity_events_select ON public.activity_events;
CREATE POLICY rmo_activity_events_select ON public.activity_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_licenses ul
      WHERE ul.license_id = activity_events.license_id
        AND ul.user_id = public.current_app_user_id()
        AND upper(ul.role) IN ('RMO', 'ADMIN')
    )
  );

-- Supabase Data API privileges (RLS still gates access)
GRANT SELECT ON public.activity_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_events TO service_role;
