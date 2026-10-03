import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense, sessionHasLicenseId, loadMemberships, membershipLicenseIds } from '@/lib/access';
import { normalizeProjectStatus } from '@/lib/projectStatus';
import { getSupabaseAdmin } from '@/lib/supabase';

function parseTrades(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((t) => String(t).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function GET(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const { searchParams } = new URL(req.url);
  const licenseNumber = searchParams.get('license_number');
  const status = searchParams.get('status');

  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('projects')
    .select(
      'id, project_address, contract_value, permit_number, trades_involved, start_date, end_date, status, scope_description, updated_at, created_at'
    )
    .eq('license_id', resolved.license.id)
    .order('updated_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', normalizeProjectStatus(status));
  }

  const { data: projects, error } = await query.limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    license: {
      id: resolved.license.id,
      license_number: resolved.license.license_number,
      entity_name: resolved.license.entity_name,
      classification: resolved.license.classification
    },
    projects: projects || []
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
  const address = String(body.project_address || body.address || '').trim();
  if (!address) {
    return NextResponse.json({ error: 'Project address is required' }, { status: 400 });
  }

  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const status = normalizeProjectStatus(body.status);
  const trades = parseTrades(body.trades_involved ?? body.trades);
  const scope =
    String(body.scope_description || body.scope || '').trim() ||
    (trades.length ? trades.join(', ') : null);

  const row = {
    license_id: resolved.license.id,
    project_address: address,
    contract_value:
      body.contract_value != null && body.contract_value !== ''
        ? Number(body.contract_value)
        : null,
    permit_number: String(body.permit_number || body.permitNumber || '').trim() || null,
    trades_involved: trades,
    scope_description: scope,
    start_date: String(body.start_date || body.startDate || '').trim() || null,
    end_date:
      status === 'COMPLETED'
        ? String(body.end_date || body.endDate || '').trim() ||
          new Date().toISOString().split('T')[0]
        : String(body.end_date || body.endDate || '').trim() || null,
    status,
    updated_at: new Date().toISOString()
  };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('projects').insert(row).select('*').single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: data });
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
    return NextResponse.json({ error: 'Project id is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from('projects')
    .select('id, license_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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

  if (body.project_address != null || body.address != null) {
    const address = String(body.project_address ?? body.address ?? '').trim();
    if (!address) {
      return NextResponse.json({ error: 'Project address is required' }, { status: 400 });
    }
    updates.project_address = address;
  }
  if (body.contract_value !== undefined) {
    updates.contract_value =
      body.contract_value != null && body.contract_value !== ''
        ? Number(body.contract_value)
        : null;
  }
  if (body.permit_number !== undefined || body.permitNumber !== undefined) {
    updates.permit_number =
      String(body.permit_number ?? body.permitNumber ?? '').trim() || null;
  }
  if (body.trades_involved !== undefined || body.trades !== undefined) {
    const trades = parseTrades(body.trades_involved ?? body.trades);
    updates.trades_involved = trades;
    if (body.scope_description === undefined && body.scope === undefined) {
      updates.scope_description = trades.length ? trades.join(', ') : null;
    }
  }
  if (body.scope_description !== undefined || body.scope !== undefined) {
    updates.scope_description =
      String(body.scope_description ?? body.scope ?? '').trim() || null;
  }
  if (body.start_date !== undefined || body.startDate !== undefined) {
    updates.start_date = String(body.start_date ?? body.startDate ?? '').trim() || null;
  }
  if (body.end_date !== undefined || body.endDate !== undefined) {
    updates.end_date = String(body.end_date ?? body.endDate ?? '').trim() || null;
  }
  if (body.status !== undefined) {
    const status = normalizeProjectStatus(body.status);
    updates.status = status;
    if (status === 'COMPLETED' && !updates.end_date) {
      updates.end_date = new Date().toISOString().split('T')[0];
    }
  }

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: data });
}
