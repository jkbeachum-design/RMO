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

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function stripQuery(path: string): string {
  return path.split('?')[0] || path;
}

/**
 * Decode URI encoding until stable. Rejects malformed sequences and
 * excessive nesting (e.g. %252e → %2e → .).
 */
export function fullyDecodeURIComponent(input: string): string | null {
  let current = input;
  for (let i = 0; i < 5; i++) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) return current;
      current = next;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Validate and canonicalize a storage object path AFTER all decoding.
 * Rejects traversal (`.`, `..`, empty segments), backslashes, absolute paths,
 * control characters, and leftover percent-encoding.
 */
export function sanitizeStorageObjectPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Reject opaque backslashes before decode (also caught after for %5c)
  if (trimmed.includes('\\') || trimmed.includes('\0')) return null;

  const decoded = fullyDecodeURIComponent(trimmed);
  if (decoded == null) return null;

  // Final form must not retain encoding artifacts or absolute/Windows paths
  if (decoded.includes('%')) return null;
  if (decoded.includes('\\')) return null;
  if (decoded.startsWith('/')) return null;
  if (CONTROL_CHARS.test(decoded)) return null;

  const segments = decoded.split('/');
  if (segments.length < 2) return null;
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..') return null;
  }

  return segments.join('/');
}

/**
 * Encode each path segment for Supabase Storage APIs so `..` / special
 * characters cannot be collapsed by intermediate HTTP clients.
 */
export function encodeStorageObjectPath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/**
 * Derive a compliance-documents object path from a public/signed URL,
 * `/api/files?path=…` href, or a raw storage path.
 * Returns null for external URLs, traversal, or invalid values.
 *
 * Every branch sanitizes the FINAL decoded path (never trust pre-decode checks).
 */
export function extractComplianceStoragePath(
  value: string | null | undefined
): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/api/files')) {
    try {
      const url = new URL(trimmed, 'http://local.invalid');
      const p = url.searchParams.get('path');
      if (!p) return null;
      // searchParams already decodes once; sanitize fully-decodes + validates
      return sanitizeStorageObjectPath(p);
    } catch {
      return null;
    }
  }

  for (const marker of [PUBLIC_MARKER, SIGN_MARKER, AUTH_MARKER]) {
    const idx = trimmed.indexOf(marker);
    if (idx !== -1) {
      const rest = stripQuery(trimmed.slice(idx + marker.length));
      return sanitizeStorageObjectPath(rest);
    }
  }

  // Raw storage path: license_number/...
  if (/^https?:\/\//i.test(trimmed)) return null;
  return sanitizeStorageObjectPath(trimmed);
}

/**
 * Resolve a `/api/files` query `path` param the same way the route does.
 * Covers raw paths and full public/signed URLs passed as the path value.
 */
export function resolveFilesApiPath(pathParam: string | null | undefined): string | null {
  return extractComplianceStoragePath(pathParam);
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
  const sanitized = sanitizeStorageObjectPath(path);
  if (!sanitized) return null;
  return sanitized.split('/')[0] || null;
}

/**
 * True when the sanitized path is under the given license number prefix.
 * Uses the final path only (never a pre-normalization prefix).
 */
export function pathBelongsToLicense(path: string, licenseNumber: string): boolean {
  const sanitized = sanitizeStorageObjectPath(path);
  if (!sanitized || !licenseNumber) return false;
  return sanitized.startsWith(`${licenseNumber}/`);
}
