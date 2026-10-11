import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  COMPLIANCE_DOCUMENTS_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  encodeStorageObjectPath,
  licenseNumberFromStoragePath,
  pathBelongsToLicense,
  resolveFilesApiPath
} from '@/lib/storagePaths';

/**
 * Authorized file open: session must have access to the license that owns the
 * object path (first path segment = license_number). Redirects to a short-lived
 * Supabase signed download URL — never expose permanent public links.
 */
export async function GET(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  // searchParams.get already URL-decodes once; resolveFilesApiPath fully decodes
  // and rejects traversal / encoding tricks before any authz or storage call.
  const storagePath = resolveFilesApiPath(searchParams.get('path'));
  if (!storagePath) {
    return NextResponse.json({ error: 'Invalid or missing path' }, { status: 400 });
  }

  const licenseNumber = licenseNumberFromStoragePath(storagePath);
  if (!licenseNumber) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const live = await refreshSessionMemberships(session);
  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Re-check on the FINAL sanitized path (not a pre-decode prefix).
  if (!pathBelongsToLicense(storagePath, resolved.license.license_number)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(COMPLIANCE_DOCUMENTS_BUCKET)
    .createSignedUrl(encodeStorageObjectPath(storagePath), SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: 'Could not create signed URL', details: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}
