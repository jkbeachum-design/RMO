import { NextRequest, NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  DEFAULT_COMPLIANCE_SETTINGS,
  mergeComplianceSettings,
  type ComplianceSettings
} from '@/lib/rules';

async function requireRmo() {
  const session = getSession();
  if (!session || session.mode !== 'RMO') return null;
  return refreshSessionMemberships(session);
}

function rowToSettings(row: Record<string, unknown> | null | undefined): ComplianceSettings {
  if (!row) return { ...DEFAULT_COMPLIANCE_SETTINGS };
  return mergeComplianceSettings({
    contract_value_threshold: Number(row.contract_value_threshold),
    permit_required_above: Number(row.permit_required_above),
    min_trades_for_b_general: Number(row.min_trades_for_b_general),
    flag_unverified_subs: row.flag_unverified_subs !== false,
    flag_expired_coi: row.flag_expired_coi !== false,
    flag_workers_comp_exempt_crew: row.flag_workers_comp_exempt_crew !== false,
    flag_scope_mismatch: row.flag_scope_mismatch !== false,
    flag_missing_permit: row.flag_missing_permit !== false,
    low_involvement_days: Number(row.low_involvement_days),
    digest_enabled: row.digest_enabled !== false,
    digest_hour_pt: Number(row.digest_hour_pt),
    alert_email: (row.alert_email as string | null) || null,
    alert_phone: (row.alert_phone as string | null) || null
  });
}

export async function GET(req: NextRequest) {
  const live = await requireRmo();
  if (!live) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberships = await loadMemberships(live.userId);
  const allowedIds = membershipLicenseIds(memberships);
  if (!allowedIds.length) {
    return NextResponse.json({ error: 'No company memberships' }, { status: 403 });
  }

  const licenseId = req.nextUrl.searchParams.get('licenseId') || allowedIds[0];
  if (!allowedIds.includes(licenseId)) {
    return NextResponse.json({ error: 'Forbidden for license' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('compliance_settings')
    .select('*')
    .eq('license_id', licenseId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({
      license_id: licenseId,
      settings: DEFAULT_COMPLIANCE_SETTINGS,
      migration_required: true,
      hint: 'Apply supabase/migrations/005_compliance_settings_digests.sql',
      error: error.message
    });
  }

  return NextResponse.json({
    license_id: licenseId,
    settings: rowToSettings(data),
    licenses: memberships.map((m) => ({
      id: m.license_id,
      license_number: m.licenses?.license_number,
      entity_name: m.licenses?.entity_name
    }))
  });
}

export async function PUT(req: NextRequest) {
  const live = await requireRmo();
  if (!live) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberships = await loadMemberships(live.userId);
  const allowedIds = membershipLicenseIds(memberships);
  const body = await req.json().catch(() => ({}));
  const licenseId = String(body.licenseId || body.license_id || '');
  if (!licenseId || !allowedIds.includes(licenseId)) {
    return NextResponse.json({ error: 'Forbidden for license' }, { status: 403 });
  }

  const merged = mergeComplianceSettings(body.settings || body);
  const supabase = getSupabaseAdmin();

  const row = {
    license_id: licenseId,
    user_id: live.userId,
    contract_value_threshold: merged.contract_value_threshold,
    permit_required_above: merged.permit_required_above,
    min_trades_for_b_general: merged.min_trades_for_b_general,
    flag_unverified_subs: merged.flag_unverified_subs,
    flag_expired_coi: merged.flag_expired_coi,
    flag_workers_comp_exempt_crew: merged.flag_workers_comp_exempt_crew,
    flag_scope_mismatch: merged.flag_scope_mismatch,
    flag_missing_permit: merged.flag_missing_permit,
    low_involvement_days: merged.low_involvement_days,
    digest_enabled: merged.digest_enabled,
    digest_hour_pt: merged.digest_hour_pt,
    alert_email: merged.alert_email || null,
    alert_phone: merged.alert_phone || null,
    updated_at: new Date().toISOString()
  };

  const { data: existing } = await supabase
    .from('compliance_settings')
    .select('id')
    .eq('license_id', licenseId)
    .maybeSingle();

  let error;
  let data;
  if (existing?.id) {
    ({ data, error } = await supabase
      .from('compliance_settings')
      .update(row)
      .eq('id', existing.id)
      .select()
      .single());
  } else {
    ({ data, error } = await supabase
      .from('compliance_settings')
      .insert([{ ...row, created_at: new Date().toISOString() }])
      .select()
      .single());
  }

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: 'Apply supabase/migrations/005_compliance_settings_digests.sql'
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, license_id: licenseId, settings: rowToSettings(data) });
}
