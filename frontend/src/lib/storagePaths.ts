/** Compliance document storage helpers — private bucket + authorized access hrefs. */

export const COMPLIANCE_DOCUMENTS_BUCKET =
  process.env.STORAGE_BUCKET ||
  process.env.SUPABASE_STORAGE_BUCKET ||
  'compliance-documents';

/** Short-lived signed download TTL (seconds). */
export const SIGNED_URL_TTL_SECONDS = 600;

const PUBLIC_MARKER = `/storage/v1/object/public/${COMPLIANCE_DOCUMENTS_BUCKET}/`;
const SIGN_MARKER = `/storage/v1/object/sign/${COMPLIANCE_DOCUMENTS_BUCKET}/`;
const AUTH_MARKER = `/storage/v1/object/authenticated/${COMPLIANCE_DOCUMENTS_BUCKET}/`;

function stripQuery(path: string): string {
  return path.split('?')[0] || path;
}

/**
 * Derive a compliance-documents object path from a public/signed URL,
 * `/api/files?path=…` href, or a raw storage path.
 * Returns null for external URLs or invalid values.
 */
export function extractComplianceStoragePath(
  value: string | null | undefined
): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('..')) return null;

  if (trimmed.startsWith('/api/files')) {
    try {
      const url = new URL(trimmed, 'http://local.invalid');
      const p = url.searchParams.get('path');
      if (!p) return null;
      const decoded = decodeURIComponent(p).trim();
      if (!decoded || decoded.includes('..') || decoded.startsWith('/')) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  for (const marker of [PUBLIC_MARKER, SIGN_MARKER, AUTH_MARKER]) {
    const idx = trimmed.indexOf(marker);
    if (idx !== -1) {
      const rest = stripQuery(trimmed.slice(idx + marker.length));
      try {
        return decodeURIComponent(rest);
      } catch {
        return rest;
      }
    }
  }

  // Raw storage path: license_number/...
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) return null;
  if (!trimmed.includes('/')) return null;
  return trimmed;
}

/** App-relative href that redirects to a fresh signed URL after authz. */
export function toFileAccessHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const path = extractComplianceStoragePath(value);
  if (path) return `/api/files?path=${encodeURIComponent(path)}`;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

/** True when value references a stored compliance file or an external http(s) URL. */
export function isFileRef(value: string | null | undefined): boolean {
  return toFileAccessHref(value) != null;
}

/** Normalize a COI/document ref to a storage path when it belongs to our bucket. */
export function normalizeStoredFileRef(value: string | null | undefined): string | null {
  if (!value) return null;
  const path = extractComplianceStoragePath(value);
  if (path) return path;
  const trimmed = value.trim();
  return trimmed || null;
}

/** License number prefix used for membership checks on object paths. */
export function licenseNumberFromStoragePath(path: string): string | null {
  const first = path.split('/').filter(Boolean)[0];
  return first || null;
}
