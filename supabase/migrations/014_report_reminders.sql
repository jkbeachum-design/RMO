-- Required CEO report reminders (biweekly cadence + project-event dues)
-- Data API GRANTs required for new public tables (see 008 / 009 house rules).

-- ---------------------------------------------------------------------------
-- 1. Per-license reminder / cadence settings
-- ---------------------------------------------------------------------------
ALTER TABLE public.compliance_settings
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_cadence text NOT NULL DEFAULT 'biweekly',
  ADD COLUMN IF NOT EXISTS report_due_weekday integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS report_anchor_date date NOT NULL DEFAULT DATE '2026-10-22';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'compliance_settings_report_cadence_check'
  ) THEN
    ALTER TABLE public.compliance_settings
      ADD CONSTRAINT compliance_settings_report_cadence_check
      CHECK (report_cadence IN ('biweekly', 'weekly', 'monthly'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'compliance_settings_report_due_weekday_check'
  ) THEN
    ALTER TABLE public.compliance_settings
      ADD CONSTRAINT compliance_settings_report_due_weekday_check
      CHECK (report_due_weekday BETWEEN 0 AND 6);
  END IF;
END $$;

COMMENT ON COLUMN public.compliance_settings.reminder_enabled IS
  'When true, daily digest cron sends required-report reminders to operators on this license.';
COMMENT ON COLUMN public.compliance_settings.report_cadence IS
  'Report cadence: biweekly (default), weekly, or monthly.';
COMMENT ON COLUMN public.compliance_settings.report_due_weekday IS
  'JS weekday for cadence dues (0=Sunday … 4=Thursday). Default Thursday.';
COMMENT ON COLUMN public.compliance_settings.report_anchor_date IS
  'First cadence due date (Pacific calendar date). Default 2026-10-22.';

-- Default ON for Vanguard (1160775) after deploy
INSERT INTO public.compliance_settings (
  license_id,
  reminder_enabled,
  report_cadence,
  report_due_weekday,
  report_anchor_date,
  created_at,
  updated_at
)
SELECT l.id, true, 'biweekly', 4, DATE '2026-10-22', now(), now()
FROM public.licenses l
WHERE l.license_number = '1160775'
ON CONFLICT (license_id) DO UPDATE
SET
  reminder_enabled = true,
  report_cadence = COALESCE(public.compliance_settings.report_cadence, 'biweekly'),
  report_due_weekday = COALESCE(public.compliance_settings.report_due_weekday, 4),
  report_anchor_date = COALESCE(public.compliance_settings.report_anchor_date, DATE '2026-10-22'),
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Idempotent reminder send log (one row per step per due)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  due_kind text NOT NULL CHECK (due_kind IN ('cadence', 'project_event')),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  step text NOT NULL CHECK (
    step IN ('due_soon', 'past_due', 'overdue_3d', 'overdue_7d')
  ),
  channel text NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'ntfy', 'none')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reminder_log_idempotent_idx
  ON public.reminder_log (
    license_id,
    user_id,
    due_date,
    due_kind,
    step,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS reminder_log_license_due_idx
  ON public.reminder_log (license_id, due_date DESC);

CREATE INDEX IF NOT EXISTS reminder_log_user_due_idx
  ON public.reminder_log (user_id, due_date DESC);

COMMENT ON TABLE public.reminder_log IS
  'Idempotent log of required-report reminder steps (due_soon / past_due / overdue_3d / overdue_7d).';

ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmo_reminder_log_select ON public.reminder_log;
CREATE POLICY rmo_reminder_log_select ON public.reminder_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_licenses ul
      WHERE ul.license_id = reminder_log.license_id
        AND ul.user_id = public.current_app_user_id()
        AND upper(ul.role) IN ('RMO', 'ADMIN')
    )
  );

-- Inserts are performed by the digest job via service_role (bypasses RLS).
DROP POLICY IF EXISTS rmo_reminder_log_insert ON public.reminder_log;
CREATE POLICY rmo_reminder_log_insert ON public.reminder_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_licenses ul
      WHERE ul.license_id = reminder_log.license_id
        AND ul.user_id = public.current_app_user_id()
        AND upper(ul.role) IN ('RMO', 'ADMIN')
    )
  );

GRANT SELECT ON public.reminder_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_log TO service_role;
