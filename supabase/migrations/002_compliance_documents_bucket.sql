-- Optional: storage bucket for structured PWA uploads (COI / permits / photos)
-- Run in Supabase SQL editor or create via Dashboard → Storage.

INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-documents', 'compliance-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for pilot; tighten before production if needed.
CREATE POLICY IF NOT EXISTS rmo_compliance_docs_public_read
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'compliance-documents');

-- Service role uploads bypass RLS; no insert policy required for service_role.
