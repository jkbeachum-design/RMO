-- Roles matrix support + company onboarding completion (priority #10)

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_step text DEFAULT 'company';

COMMENT ON COLUMN public.licenses.onboarding_completed_at IS
  'Set when RMO/ADMIN finishes company onboarding wizard (association docs, ownership, duty, bonds).';

CREATE TABLE IF NOT EXISTS public.company_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('RMO', 'OPERATOR', 'ADMIN', 'PM', 'FOREMAN')),
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  accepted_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_invites_license_idx ON public.company_invites (license_id);
CREATE INDEX IF NOT EXISTS company_invites_email_idx ON public.company_invites (lower(email));

COMMENT ON TABLE public.company_invites IS
  'Pending team invites with target role. RMO/ADMIN manage memberships; invitee accepts with matching email.';

ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmo_company_invites_select ON public.company_invites;
CREATE POLICY rmo_company_invites_select ON public.company_invites
  FOR SELECT TO authenticated
  USING (public.user_has_license_access(license_id));
