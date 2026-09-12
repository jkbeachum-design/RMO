-- Configurable compliance rules + digest settings (priority #9)

CREATE TABLE IF NOT EXISTS public.compliance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid REFERENCES public.licenses(id) ON DELETE CASCADE,
  -- NULL license_id = org/global defaults for the RMO account owner
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  -- Rule thresholds
  contract_value_threshold numeric NOT NULL DEFAULT 10000,
  permit_required_above numeric NOT NULL DEFAULT 10000,
  min_trades_for_b_general integer NOT NULL DEFAULT 3,
  flag_unverified_subs boolean NOT NULL DEFAULT true,
  flag_expired_coi boolean NOT NULL DEFAULT true,
  flag_workers_comp_exempt_crew boolean NOT NULL DEFAULT true,
  flag_scope_mismatch boolean NOT NULL DEFAULT true,
  flag_missing_permit boolean NOT NULL DEFAULT true,
  -- Low-involvement / digest
  low_involvement_days integer NOT NULL DEFAULT 14,
  digest_enabled boolean NOT NULL DEFAULT true,
  digest_hour_pt integer NOT NULL DEFAULT 7 CHECK (digest_hour_pt BETWEEN 0 AND 23),
  alert_email text,
  alert_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (license_id),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS compliance_settings_user_id_idx
  ON public.compliance_settings (user_id);

COMMENT ON TABLE public.compliance_settings IS
  'Per-license or per-user rule thresholds and digest preferences. license_id null = user defaults.';

ALTER TABLE public.compliance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmo_settings_select ON public.compliance_settings;
CREATE POLICY rmo_settings_select ON public.compliance_settings
  FOR SELECT TO authenticated
  USING (
    user_id = public.current_app_user_id()
    OR (license_id IS NOT NULL AND public.user_has_license_access(license_id))
  );

DROP POLICY IF EXISTS rmo_settings_write ON public.compliance_settings;
CREATE POLICY rmo_settings_write ON public.compliance_settings
  FOR ALL TO authenticated
  USING (
    user_id = public.current_app_user_id()
    OR (license_id IS NOT NULL AND public.user_has_license_access(license_id))
  )
  WITH CHECK (
    user_id = public.current_app_user_id()
    OR (license_id IS NOT NULL AND public.user_has_license_access(license_id))
  );

CREATE TABLE IF NOT EXISTS public.digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  license_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
  run_date date NOT NULL DEFAULT (timezone('America/Los_Angeles', now()))::date,
  kind text NOT NULL DEFAULT 'MORNING'
    CHECK (kind IN ('MORNING', 'LOW_INVOLVEMENT', 'MANUAL')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered_email boolean DEFAULT false,
  delivered_sms boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS digest_runs_user_date_idx
  ON public.digest_runs (user_id, run_date);

CREATE INDEX IF NOT EXISTS digest_runs_license_date_idx
  ON public.digest_runs (license_id, run_date);

ALTER TABLE public.digest_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmo_digest_runs_select ON public.digest_runs;
CREATE POLICY rmo_digest_runs_select ON public.digest_runs
  FOR SELECT TO authenticated
  USING (
    user_id = public.current_app_user_id()
    OR (license_id IS NOT NULL AND public.user_has_license_access(license_id))
  );
