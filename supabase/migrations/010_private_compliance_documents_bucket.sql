-- Make compliance-documents bucket private; scrub permanent public URLs from DB.
-- Rollout: deploy app code that uses /api/files signed redirects FIRST, then apply this.
-- Service role uploads/downloads continue to bypass storage RLS.

-- ---------------------------------------------------------------------------
-- 1. Private bucket + drop public read policy
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
SET public = false
WHERE id = 'compliance-documents';

DROP POLICY IF EXISTS rmo_compliance_docs_public_read ON storage.objects;

-- ---------------------------------------------------------------------------
-- 2. documents: backfill storage_path, allow null file_url, scrub public URLs
-- ---------------------------------------------------------------------------
UPDATE public.documents
SET storage_path = substring(
  file_url
  from '/storage/v1/object/public/compliance-documents/(.+)$'
)
WHERE (storage_path IS NULL OR storage_path = '')
  AND file_url LIKE '%/storage/v1/object/public/compliance-documents/%';

-- Rows that already stored a raw path in file_url (post code-deploy, pre-migration)
UPDATE public.documents
SET storage_path = file_url
WHERE (storage_path IS NULL OR storage_path = '')
  AND file_url IS NOT NULL
  AND file_url NOT LIKE 'http%'
  AND file_url LIKE '%/%'
  AND file_url NOT LIKE '%..%';

ALTER TABLE public.documents
  ALTER COLUMN file_url DROP NOT NULL;

UPDATE public.documents
SET file_url = NULL
WHERE storage_path IS NOT NULL
  AND file_url IS NOT NULL
  AND (
    file_url LIKE '%/storage/v1/object/public/compliance-documents/%'
    OR file_url = storage_path
  );

COMMENT ON COLUMN public.documents.file_url IS
  'Deprecated permanent URL column; prefer storage_path + /api/files signed access. Null when storage_path is set.';
COMMENT ON COLUMN public.documents.storage_path IS
  'Object path inside the compliance-documents bucket (license_number/…).';

-- ---------------------------------------------------------------------------
-- 3. subcontractors.notes: public COI URLs → storage paths
-- ---------------------------------------------------------------------------
UPDATE public.subcontractors
SET notes = regexp_replace(
  notes,
  '^https?://[^/]+/storage/v1/object/public/compliance-documents/',
  ''
)
WHERE notes LIKE '%/storage/v1/object/public/compliance-documents/%';

-- ---------------------------------------------------------------------------
-- 4. compliance_logs.extracted_data: strip public URL prefix → leave object path
-- ---------------------------------------------------------------------------
UPDATE public.compliance_logs
SET extracted_data = (
  regexp_replace(
    extracted_data::text,
    'https?://[^"\\]+/storage/v1/object/public/compliance-documents/',
    '',
    'g'
  )
)::jsonb
WHERE extracted_data IS NOT NULL
  AND extracted_data::text LIKE '%/storage/v1/object/public/compliance-documents/%';

-- No new public tables in this migration — GRANTs N/A.
