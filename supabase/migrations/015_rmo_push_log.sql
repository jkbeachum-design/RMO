-- RMO push notification log (ntfy fan-out dedupe) + due_today reminder step.
-- Data API GRANTs required for new public tables (see 008 / 009 / 014 house rules).

-- ---------------------------------------------------------------------------
-- 1. Allow due_today on reminder_log.step
-- ---------------------------------------------------------------------------
ALTER TABLE public.reminder_log
  DROP CONSTRAINT IF EXISTS reminder_log_step_check;

ALTER TABLE public.reminder_log
  ADD CONSTRAINT reminder_log_step_check
  CHECK (step IN ('due_soon', 'due_today', 'past_due', 'overdue_3d', 'overdue_7d'));

COMMENT ON TABLE public.reminder_log IS
  'Idempotent log of required-report reminder steps (due_soon / due_today / past_due / overdue_3d / overdue_7d).';

-- ---------------------------------------------------------------------------
-- 2. rmo_push_log — dedupe + audit for RMO/ADMIN ntfy pushes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rmo_push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rmo_push_log_license_created_idx
  ON public.rmo_push_log (license_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rmo_push_log_kind_created_idx
  ON public.rmo_push_log (kind, created_at DESC);

COMMENT ON TABLE public.rmo_push_log IS
  'Idempotent log of RMO/ADMIN ntfy pushes. dedupe_key is unique; service_role writes from Next.js.';

ALTER TABLE public.rmo_push_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmo_push_log_select ON public.rmo_push_log;
CREATE POLICY rmo_push_log_select ON public.rmo_push_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_licenses ul
      WHERE ul.license_id = rmo_push_log.license_id
        AND ul.user_id = public.current_app_user_id()
        AND upper(ul.role) IN ('RMO', 'ADMIN')
    )
  );

-- Inserts/updates are performed by Next.js via service_role (bypasses RLS).
DROP POLICY IF EXISTS rmo_push_log_insert ON public.rmo_push_log;
CREATE POLICY rmo_push_log_insert ON public.rmo_push_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_licenses ul
      WHERE ul.license_id = rmo_push_log.license_id
        AND ul.user_id = public.current_app_user_id()
        AND upper(ul.role) IN ('RMO', 'ADMIN')
    )
  );

GRANT SELECT ON public.rmo_push_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rmo_push_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rmo_push_log TO service_role;
