-- Company create: enforce unique CSLB license numbers for greenfield inserts.
-- No new public tables — existing Data API grants on licenses / user_licenses unchanged.

CREATE UNIQUE INDEX IF NOT EXISTS licenses_license_number_uidx
  ON public.licenses (license_number);

COMMENT ON INDEX public.licenses_license_number_uidx IS
  'CSLB license numbers are unique; RMO/ADMIN create-company rejects duplicates.';
