import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  buildDisassociationDeadlines,
  eligibilityLabel,
  firmLimitStatus,
  summarizeClocks,
  type EligibilityBasis,
  type FirmAssociation,
  type DisassociationClock
} from '@/lib/portfolio';

async function requireRmo() {
  const session = getSession();
  if (!session || session.mode !== 'RMO') return null;
  return refreshSessionMemberships(session);
}

export async function GET() {
  const live = await requireRmo();
  if (!live) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberships = await loadMemberships(live.userId);
  const allowedIds = membershipLicenseIds(memberships);
  const supabase = getSupabaseAdmin();

  const { data: associations, error: aErr } = await supabase
    .from('qualifier_firm_associations')
    .select(
      'id, license_id, eligibility_basis, ownership_pct, associated_at, disassociated_at, status, notes, licenses(license_number, entity_name, classification)'
    )
    .eq('user_id', live.userId)
    .order('associated_at', { ascending: false });

  if (aErr) {
    console.warn('qualifier_firm_associations missing, synthesizing:', aErr.message);
    const { data: licenses } = allowedIds.length
      ? await supabase
          .from('licenses')
          .select('id, license_number, entity_name, classification')
          .in('id', allowedIds)
      : { data: [] };

    const synthesized: FirmAssociation[] = (licenses || []).map((l, i) => ({
      id: `synth-${l.id}`,
      license_id: l.id,
      eligibility_basis: (i === 0 ? 'PRIMARY' : 'OTHER') as EligibilityBasis,
      associated_at: new Date().toISOString(),
      status: 'ACTIVE' as const,
      license_number: l.license_number,
      entity_name: l.entity_name,
      classification: l.classification
    }));

    return NextResponse.json({
      associations: synthesized,
      clocks: [],
      limit: firmLimitStatus(synthesized),
      migration_required: true,
      hint: 'Apply supabase/migrations/004_firm_portfolio_clocks.sql'
    });
  }

  const mapped: FirmAssociation[] = (associations || []).map((row) => {
    const lic = Array.isArray(row.licenses) ? row.licenses[0] : row.licenses;
    return {
      id: row.id,
      license_id: row.license_id,
      eligibility_basis: row.eligibility_basis as EligibilityBasis,
      ownership_pct: row.ownership_pct,
      associated_at: row.associated_at,
      disassociated_at: row.disassociated_at,
      status: row.status,
      license_number: lic?.license_number,
      entity_name: lic?.entity_name,
      classification: lic?.classification
    };
  });

  const { data: clocks } = await supabase
    .from('firm_disassociation_clocks')
    .select(
      'id, association_id, license_id, disassociated_at, notify_deadline, replace_deadline, notify_completed_at, replace_completed_at, licenses(license_number, entity_name)'
    )
    .eq('user_id', live.userId)
    .order('replace_deadline', { ascending: true });

  const mappedClocks: DisassociationClock[] = (clocks || []).map((c) => {
    const lic = Array.isArray(c.licenses) ? c.licenses[0] : c.licenses;
    return {
      id: c.id,
      association_id: c.association_id,
      license_id: c.license_id,
      disassociated_at: c.disassociated_at,
      notify_deadline: c.notify_deadline,
      replace_deadline: c.replace_deadline,
      notify_completed_at: c.notify_completed_at,
      replace_completed_at: c.replace_completed_at,
      license_number: lic?.license_number,
      entity_name: lic?.entity_name
    };
  });

  return NextResponse.json({
    associations: mapped,
    clocks: summarizeClocks(mappedClocks),
    limit: firmLimitStatus(mapped),
    eligibility_labels: {
      PRIMARY: eligibilityLabel('PRIMARY'),
      OWNERSHIP_20: eligibilityLabel('OWNERSHIP_20'),
      SUBSIDIARY_JV: eligibilityLabel('SUBSIDIARY_JV'),
      SAME_OFFICERS: eligibilityLabel('SAME_OFFICERS'),
      OTHER: eligibilityLabel('OTHER')
    }
  });
}

export async function POST(req: Request) {
  const live = await requireRmo();
  if (!live) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const supabase = getSupabaseAdmin();
  const memberships = await loadMemberships(live.userId);
  const allowed = new Set(membershipLicenseIds(memberships));

  if (action === 'associate') {
    const licenseId = String(body.license_id || '');
    if (!licenseId || !allowed.has(licenseId)) {
      return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
    }

    const { data: existing } = await supabase
      .from('qualifier_firm_associations')
      .select(
        'id, license_id, eligibility_basis, ownership_pct, associated_at, disassociated_at, status'
      )
      .eq('user_id', live.userId);

    const limit = firmLimitStatus((existing || []) as FirmAssociation[]);
    if (limit.atLimit) {
      return NextResponse.json(
        {
          error: `§7068.1 limit reached: ${limit.used}/${limit.max} firms in the rolling one-year window`,
          limit
        },
        { status: 409 }
      );
    }

    const basis = (body.eligibility_basis || 'OTHER') as EligibilityBasis;
    const { data, error } = await supabase
      .from('qualifier_firm_associations')
      .insert([
        {
          user_id: live.userId,
          license_id: licenseId,
          eligibility_basis: basis,
          ownership_pct: body.ownership_pct ?? null,
          associated_at: body.associated_at || new Date().toISOString(),
          status: 'ACTIVE',
          notes: body.notes || null
        }
      ])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      association: data,
      limit: firmLimitStatus([...(existing || []), data] as FirmAssociation[])
    });
  }

  if (action === 'disassociate') {
    const associationId = String(body.association_id || '');
    const { data: assoc, error: findErr } = await supabase
      .from('qualifier_firm_associations')
      .select('*')
      .eq('id', associationId)
      .eq('user_id', live.userId)
      .maybeSingle();

    if (findErr || !assoc) {
      return NextResponse.json({ error: 'Association not found' }, { status: 404 });
    }
    if (!allowed.has(assoc.license_id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const disassociatedAt = new Date().toISOString();
    const deadlines = buildDisassociationDeadlines(disassociatedAt);

    const { error: updErr } = await supabase
      .from('qualifier_firm_associations')
      .update({
        status: 'DISASSOCIATED',
        disassociated_at: disassociatedAt,
        updated_at: disassociatedAt
      })
      .eq('id', associationId);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    const { data: clock, error: clockErr } = await supabase
      .from('firm_disassociation_clocks')
      .insert([
        {
          association_id: associationId,
          user_id: live.userId,
          license_id: assoc.license_id,
          disassociated_at: disassociatedAt,
          notify_deadline: deadlines.notify_deadline.toISOString(),
          replace_deadline: deadlines.replace_deadline.toISOString()
        }
      ])
      .select()
      .single();

    if (clockErr) return NextResponse.json({ error: clockErr.message }, { status: 500 });
    return NextResponse.json({ clock, association_id: associationId });
  }

  if (action === 'complete_notify' || action === 'complete_replace') {
    const clockId = String(body.clock_id || '');
    const field =
      action === 'complete_notify' ? 'notify_completed_at' : 'replace_completed_at';
    const { data, error } = await supabase
      .from('firm_disassociation_clocks')
      .update({ [field]: new Date().toISOString() })
      .eq('id', clockId)
      .eq('user_id', live.userId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ clock: data });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
