-- Supervision evidence log (MVP)
CREATE TABLE IF NOT EXISTS public.supervision_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (
    activity_type IN (
      'SUPERVISE_OPS',
      'TECH_ADMIN_DECISION',
      'WORKMANSHIP_QC',
      'ONSITE_VISIT',
      'MONITOR_DELEGATED',
      'OTHER'
    )
  ),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL,
  details text,
  project_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supervision_activities_license_id_idx
  ON public.supervision_activities (license_id, occurred_at DESC);

ALTER TABLE public.supervision_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmo_supervision_select ON public.supervision_activities;
CREATE POLICY rmo_supervision_select ON public.supervision_activities
  FOR SELECT TO authenticated
  USING (public.user_has_license_access(license_id));

DROP POLICY IF EXISTS rmo_supervision_insert ON public.supervision_activities;
CREATE POLICY rmo_supervision_insert ON public.supervision_activities
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_license_access(license_id));
