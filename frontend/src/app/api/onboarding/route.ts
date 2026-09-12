import { NextRequest, NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import {
  loadMemberships,
  membershipLicenseIds,
  canManageLicenseTeam
} from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  onboardingChecklist,
  onboardingComplete,
  nextOnboardingStep,
  type OnboardingStepId
} from '@/lib/roles';

const LICENSE_SELECT = [
  'id',
  'license_number',
  'entity_name',
  'classification',
  'workers_comp_status',
  'license_expire_date',
  'rmo_name',
  'business_address',
  'ownership_pct',
  'is_subsidiary',
  'is_joint_venture',
  'officers_json',
  'contractor_bond_status',
  'contractor_bond_expire_date',
  'bqi_status',
  'bqi_expire_date',
  'duty_statement',
  'association_docs_url',
  'onboarding_completed_at',
  'onboarding_step'
].join(', ');

async function requireRmo() {
  const session = getSession();
  if (!session || session.mode !== 'RMO') return null;
  return refreshSessionMemberships(session);
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
  const { data: license, error } = await supabase
    .from('licenses')
    .select(LICENSE_SELECT)
    .eq('id', licenseId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({
      license_id: licenseId,
      migration_required: true,
      hint: 'Apply migrations 004 and 006 for onboarding fields',
      error: error.message,
      can_edit: canManageLicenseTeam(memberships, licenseId)
    });
  }

  const licenseRow = (license as unknown as Record<string, unknown>) || {};
  const checklist = onboardingChecklist(licenseRow as Parameters<typeof onboardingChecklist>[0]);
  return NextResponse.json({
    license_id: licenseId,
    license: licenseRow,
    checklist,
    complete:
      onboardingComplete(checklist) || Boolean(licenseRow.onboarding_completed_at),
    can_edit: canManageLicenseTeam(memberships, licenseId),
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

  const body = await req.json().catch(() => ({}));
  const licenseId = String(body.licenseId || body.license_id || '');
  const memberships = await loadMemberships(live.userId);
  if (!licenseId || !membershipLicenseIds(memberships).includes(licenseId)) {
    return NextResponse.json({ error: 'Forbidden for license' }, { status: 403 });
  }
  if (!canManageLicenseTeam(memberships, licenseId)) {
    return NextResponse.json(
      { error: 'Only RMO or ADMIN can edit company onboarding' },
      { status: 403 }
    );
  }

  const patch: Record<string, unknown> = {};
  const fields = [
    'entity_name',
    'rmo_name',
    'business_address',
    'classification',
    'ownership_pct',
    'is_subsidiary',
    'is_joint_venture',
    'officers_json',
    'contractor_bond_status',
    'contractor_bond_expire_date',
    'bqi_status',
    'bqi_expire_date',
    'duty_statement',
    'association_docs_url',
    'onboarding_step'
  ] as const;

  const source = body.settings && typeof body.settings === 'object' ? body.settings : body;
  for (const key of fields) {
    if (source[key] !== undefined) patch[key] = source[key];
  }

  if (body.mark_complete === true) {
    patch.onboarding_completed_at = new Date().toISOString();
    patch.onboarding_step = 'review';
  } else if (body.advance === true && typeof patch.onboarding_step === 'string') {
    const next = nextOnboardingStep(patch.onboarding_step as OnboardingStepId);
    if (next) patch.onboarding_step = next;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('licenses')
    .update(patch)
    .eq('id', licenseId)
    .select(LICENSE_SELECT)
    .single();

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: 'Apply supabase/migrations/004_firm_portfolio_clocks.sql and 006_roles_onboarding.sql'
      },
      { status: 500 }
    );
  }

  const licenseRow = (data as unknown as Record<string, unknown>) || {};
  const checklist = onboardingChecklist(
    licenseRow as Parameters<typeof onboardingChecklist>[0]
  );
  if (body.mark_complete === true && !onboardingComplete(checklist)) {
    await supabase
      .from('licenses')
      .update({ onboarding_completed_at: null })
      .eq('id', licenseId);
    return NextResponse.json(
      {
        error:
          'Complete ownership, duty statement, bond status, and association docs before finishing',
        checklist,
        license: licenseRow
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    license: licenseRow,
    checklist,
    complete: onboardingComplete(checklist) || Boolean(licenseRow.onboarding_completed_at)
  });
}
