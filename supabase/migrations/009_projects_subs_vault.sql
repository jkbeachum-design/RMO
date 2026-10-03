-- CEO/RMO project & sub workflows + operator document vault
-- Data API GRANTs required for new public tables after Oct 30 2026.

-- ---------------------------------------------------------------------------
-- 1. Subcontractor contact fields (small commercial / residential jobs)
-- ---------------------------------------------------------------------------
ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.subcontractors.contact_name IS
  'Primary contact person at the subcontractor company.';
COMMENT ON COLUMN public.subcontractors.phone IS
  'Contact phone for the subcontractor.';
COMMENT ON COLUMN public.subcontractors.email IS
  'Contact email for the subcontractor.';

-- ---------------------------------------------------------------------------
-- 2. Company document vault (operator-uploaded files; bucket stays as-is)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  title text NOT NULL,
  doc_type text NOT NULL DEFAULT 'OTHER'
    CHECK (doc_type IN ('COI', 'PERMIT', 'PHOTO', 'OTHER')),
  file_url text NOT NULL,
  storage_path text,
  expires_on date,
  related_name text,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_license_id_idx ON public.documents (license_id);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON public.documents (created_at DESC);

COMMENT ON TABLE public.documents IS
  'Company document vault entries (COI/permit/photo/other) uploaded from the CEO portal.';

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rmo_documents_select ON public.documents;
CREATE POLICY rmo_documents_select ON public.documents
  FOR SELECT TO authenticated
  USING (public.user_has_license_access(license_id));

DROP POLICY IF EXISTS rmo_documents_insert ON public.documents;
CREATE POLICY rmo_documents_insert ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_license_access(license_id));

DROP POLICY IF EXISTS rmo_documents_update ON public.documents;
CREATE POLICY rmo_documents_update ON public.documents
  FOR UPDATE TO authenticated
  USING (public.user_has_license_access(license_id))
  WITH CHECK (public.user_has_license_access(license_id));

DROP POLICY IF EXISTS rmo_documents_delete ON public.documents;
CREATE POLICY rmo_documents_delete ON public.documents
  FOR DELETE TO authenticated
  USING (public.user_has_license_access(license_id));

-- Supabase Data API privileges for new public table
GRANT SELECT ON public.documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO service_role;
