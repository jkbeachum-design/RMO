import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import { loadVaultDocuments } from '@/lib/vaultDocuments';

const BUCKET = process.env.STORAGE_BUCKET || 'compliance-documents';
const DOC_TYPES = new Set(['COI', 'PERMIT', 'PHOTO', 'OTHER']);

export async function GET(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const { searchParams } = new URL(req.url);
  const licenseNumber = searchParams.get('license_number');
  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const items = await loadVaultDocuments(supabase, [resolved.license.id]);
  return NextResponse.json({
    license: {
      id: resolved.license.id,
      license_number: resolved.license.license_number,
      entity_name: resolved.license.entity_name
    },
    documents: items
  });
}

/** CEO (or dual-mode) upload into existing compliance-documents bucket + documents row. */
export async function POST(req: Request) {
  const session = getSession();
  if (!session || session.mode !== 'OPERATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const formData = await req.formData();
  const licenseNumber = String(formData.get('license_number') || formData.get('licenseId') || '').trim();
  const title = String(formData.get('title') || '').trim();
  const docTypeRaw = String(formData.get('doc_type') || 'OTHER').toUpperCase();
  const docType = DOC_TYPES.has(docTypeRaw) ? docTypeRaw : 'OTHER';
  const expiresOn = String(formData.get('expires_on') || '').trim() || null;
  const relatedName = String(formData.get('related_name') || '').trim() || null;
  const file = formData.get('file');

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be 5MB or smaller' }, { status: 400 });
  }

  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${resolved.license.license_number}/vault/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false
  });

  if (uploadError) {
    return NextResponse.json(
      { error: 'Upload failed', details: uploadError.message },
      { status: 500 }
    );
  }

  const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const fileUrl = publicUrl?.publicUrl;
  if (!fileUrl) {
    return NextResponse.json({ error: 'Could not resolve public URL' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('documents')
    .insert({
      license_id: resolved.license.id,
      title,
      doc_type: docType,
      file_url: fileUrl,
      storage_path: storagePath,
      expires_on: expiresOn,
      related_name: relatedName,
      uploaded_by: live.userId,
      updated_at: new Date().toISOString()
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ document: data });
}
