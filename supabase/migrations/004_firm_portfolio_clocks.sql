-- Firm portfolio + CSLB §7068.1 / §7068.2 clocks

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS ownership_pct numeric,
  ADD COLUMN IF NOT EXISTS is_subsidiary boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_joint_venture boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS officers_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contractor_bond_status text,
  ADD COLUMN IF NOT EXISTS contractor_bond_expire_date date,
  ADD COLUMN IF NOT EXISTS bqi_status text,
  ADD COLUMN IF NOT EXISTS bqi_expire_date date,
  ADD COLUMN IF NOT EXISTS duty_statement text,
  ADD COLUMN IF NOT EXISTS association_docs_url text;

CREATE TABLE IF NOT EXISTS public.qualifier_firm_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  eligibility_basis text NOT NULL DEFAULT 'PRIMARY'
    CHECK (eligibility_basis IN (
      'PRIMARY', 'OWNERSHIP_20', 'SUBSIDIARY_JV', 'SAME_OFFICERS', 'OTHER'
    )),
  ownership_pct numeric,
  associated_at timestamptz NOT NULL DEFAULT now(),
  disassociated_at timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DISASSOCIATED', 'PENDING')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS qfa_active_user_license_uidx
  ON public.qualifier_firm_associations (user_id, license_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS qfa_user_id_idx ON public.qualifier_firm_associations (user_id);
CREATE INDEX IF NOT EXISTS qfa_license_id_idx ON public.qualifier_firm_associations (license_id);
CREATE INDEX IF NOT EXISTS qfa_user_associated_idx
  ON public.qualifier_firm_associations (user_id, associated_at);

CREATE TABLE IF NOT EXISTS public.firm_disassociation_clocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL REFERENCES public.qualifier_firm_associations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  disassociated_at timestamptz NOT NULL DEFAULT now(),
  notify_deadline timestamptz NOT NULL,
  replace_deadline timestamptz NOT NULL,
  notify_completed_at timestamptz,
  replace_completed_at timestamptz,
  replace_association_id uuid REFERENCES public.qualifier_firm_associations(id),
  alert_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fdc_user_id_idx ON public.firm_disassociation_clocks (user_id);
CREATE INDEX IF NOT EXISTS fdc_deadlines_idx
  ON public.firm_disassociation_clocks (notify_deadline, replace_deadline);

INSERT INTO public.qualifier_firm_associations (
  user_id, license_id, eligibility_basis, associated_at, status
)
SELECT ul.user_id, ul.license_id, 'PRIMARY', coalesce(ul.created_at, now()), 'ACTIVE'
FROM public.user_licenses ul
WHERE upper(ul.role) IN ('RMO', 'ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM public.qualifier_firm_associations q
    WHERE q.user_id = ul.user_id
      AND q.license_id = ul.license_id
      AND q.status = 'ACTIVE'
  );

ALTER TABLE public.qualifier_firm_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_disassociation_clocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmo_qfa_select ON public.qualifier_firm_associations;
CREATE POLICY rmo_qfa_select ON public.qualifier_firm_associations
  FOR SELECT TO authenticated
  USING (user_id = public.current_app_user_id() OR public.user_has_license_access(license_id));

DROP POLICY IF EXISTS rmo_qfa_write ON public.qualifier_firm_associations;
CREATE POLICY rmo_qfa_write ON public.qualifier_firm_associations
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS rmo_fdc_select ON public.firm_disassociation_clocks;
CREATE POLICY rmo_fdc_select ON public.firm_disassociation_clocks
  FOR SELECT TO authenticated
  USING (user_id = public.current_app_user_id() OR public.user_has_license_access(license_id));

DROP POLICY IF EXISTS rmo_fdc_write ON public.firm_disassociation_clocks;
CREATE POLICY rmo_fdc_write ON public.firm_disassociation_clocks
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());
