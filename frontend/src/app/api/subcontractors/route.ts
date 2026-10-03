import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import {
  loadMemberships,
  membershipLicenseIds,
  resolveAccessibleLicense,
  sessionHasLicenseId
} from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

const SUB_SELECT =
  'id, license_id, company_name, contact_name, phone, email, trade, cslb_license_number, coi_expiration_date, coi_verified, notes, updated_at, created_at';

function coiUrlFromNotes(notes: string | null | undefined): string | null {
  return typeof notes === 'string' && notes.startsWith('http') ? notes : null;
}

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
  const { data, error } = await supabase
    .from('subcontractors')
    .select(SUB_SELECT)
    .eq('license_id', resolved.license.id)
    .order('company_name', { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    license: {
      id: resolved.license.id,
      license_number: resolved.license.license_number,
      entity_name: resolved.license.entity_name
    },
    subcontractors: (data || []).map((s) => ({
      ...s,
      coi_document_url: coiUrlFromNotes(s.notes)
    }))
  });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const body = await req.json().catch(() => ({}));
  const licenseNumber = String(body.license_number || body.licenseNumber || '').trim();
  const companyName = String(body.company_name || body.company || '').trim();
  if (!companyName) {
    return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
  }

  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const coiUrl = String(body.coi_document_url || body.coiDocumentUrl || '').trim() || null;
  const coiDate = String(body.coi_expiration_date || body.coiExpiration || '').trim() || null;
  const today = new Date().toISOString().split('T')[0];

  const row = {
    license_id: resolved.license.id,
    company_name: companyName,
    contact_name: String(body.contact_name || body.contactName || '').trim() || null,
    phone: String(body.phone || '').trim() || null,
    email: String(body.email || '').trim() || null,
    trade: String(body.trade || '').trim() || null,
    cslb_license_number:
      String(body.cslb_license_number || body.cslbLicense || '').trim() || null,
    coi_expiration_date: coiDate,
    coi_verified: Boolean(coiUrl && coiDate && coiDate >= today),
    notes: coiUrl,
    updated_at: new Date().toISOString()
  };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('subcontractors')
    .insert(row)
    .select(SUB_SELECT)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    subcontractor: {
      ...data,
      coi_document_url: coiUrlFromNotes(data.notes)
    }
  });
}

export async function PATCH(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Subcontractor id is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from('subcontractors')
    .select('id, license_id, notes, coi_expiration_date')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Subcontractor not found' }, { status: 404 });
  }

  if (!sessionHasLicenseId(live, existing.license_id)) {
    const memberships = await loadMemberships(live.userId);
    if (!membershipLicenseIds(memberships).includes(existing.license_id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (body.company_name !== undefined || body.company !== undefined) {
    const companyName = String(body.company_name ?? body.company ?? '').trim();
    if (!companyName) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }
    updates.company_name = companyName;
  }
  if (body.contact_name !== undefined || body.contactName !== undefined) {
    updates.contact_name = String(body.contact_name ?? body.contactName ?? '').trim() || null;
  }
  if (body.phone !== undefined) {
    updates.phone = String(body.phone || '').trim() || null;
  }
  if (body.email !== undefined) {
    updates.email = String(body.email || '').trim() || null;
  }
  if (body.trade !== undefined) {
    updates.trade = String(body.trade || '').trim() || null;
  }
  if (body.cslb_license_number !== undefined || body.cslbLicense !== undefined) {
    updates.cslb_license_number =
      String(body.cslb_license_number ?? body.cslbLicense ?? '').trim() || null;
  }
  if (body.coi_expiration_date !== undefined || body.coiExpiration !== undefined) {
    updates.coi_expiration_date =
      String(body.coi_expiration_date ?? body.coiExpiration ?? '').trim() || null;
  }
  if (body.coi_document_url !== undefined || body.coiDocumentUrl !== undefined) {
    updates.notes =
      String(body.coi_document_url ?? body.coiDocumentUrl ?? '').trim() || null;
  }

  if (updates.coi_expiration_date !== undefined || updates.notes !== undefined) {
    const today = new Date().toISOString().split('T')[0];
    const finalUrl =
      updates.notes !== undefined
        ? (updates.notes as string | null)
        : coiUrlFromNotes(existing.notes);
    const finalDate =
      updates.coi_expiration_date !== undefined
        ? (updates.coi_expiration_date as string | null)
        : existing.coi_expiration_date || null;
    updates.coi_verified = Boolean(finalUrl && finalDate && finalDate >= today);
  }

  const { data, error } = await supabase
    .from('subcontractors')
    .update(updates)
    .eq('id', id)
    .select(SUB_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    subcontractor: {
      ...data,
      coi_document_url: coiUrlFromNotes(data.notes)
    }
  });
}
