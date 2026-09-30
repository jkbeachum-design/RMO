import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  refreshSessionMemberships,
  createSessionToken,
  SESSION_COOKIE
} from '@/lib/auth';
import {
  loadMemberships,
  membershipLicenseIds,
  canManageLicenseTeam,
  canCreateCompanies,
  rolesForUser
} from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  onboardingChecklist,
  onboardingComplete,
  nextOnboardingStep,
  normalizeLicenseNumber,
  isValidLicenseNumber,
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

function licenseOptionsFromMemberships(
  memberships: Awaited<ReturnType<typeof loadMemberships>>
) {
  const seen = new Set<string>();
  const licenses = [];
  for (const m of memberships) {
    if (seen.has(m.license_id)) continue;
    seen.add(m.license_id);
    licenses.push({
      id: m.license_id,
      license_number: m.licenses?.license_number,
      entity_name: m.licenses?.entity_name
    });
  }
  return licenses;
}

export async function GET(req: NextRequest) {
  const live = await requireRmo();
  if (!live) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberships = await loadMemberships(live.userId);
  const allowedIds = membershipLicenseIds(memberships);
  const canCreate = canCreateCompanies(memberships);

  if (!allowedIds.length) {
    return NextResponse.json({
      license_id: null,
      license: null,
      checklist: null,
      complete: false,
      can_edit: false,
      can_create: canCreate,
      licenses: []
    });
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
      can_edit: canManageLicenseTeam(memberships, licenseId),
      can_create: canCreate,
      licenses: licenseOptionsFromMemberships(memberships)
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
    can_create: canCreate,
    licenses: licenseOptionsFromMemberships(memberships)
  });
}

/**
 * Create a new CSLB company/license and auto-attach the creator as RMO.
 * Same path powers "Add company" for multi-firm portfolios.
 */
export async function POST(req: NextRequest) {
  const live = await requireRmo();
  if (!live) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberships = await loadMemberships(live.userId);
  if (!canCreateCompanies(memberships)) {
    return NextResponse.json(
      { error: 'Only RMO or ADMIN can create companies' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const licenseNumber = normalizeLicenseNumber(body.license_number || body.licenseNumber);
  const entityName = String(body.entity_name || body.entityName || '').trim();

  if (!isValidLicenseNumber(licenseNumber)) {
    return NextResponse.json(
      { error: 'license_number must be 4–12 digits (CSLB license #)' },
      { status: 400 }
    );
  }
  if (!entityName) {
    return NextResponse.json({ error: 'entity_name is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from('licenses')
    .select('id, license_number')
    .eq('license_number', licenseNumber)
    .maybeSingle();

  if (existing) {
    const alreadyMember = membershipLicenseIds(memberships).includes(existing.id);
    return NextResponse.json(
      {
        error: alreadyMember
          ? 'You already manage this license number'
          : 'A company with this license number already exists',
        license_id: alreadyMember ? existing.id : undefined
      },
      { status: 409 }
    );
  }

  const insertRow: Record<string, unknown> = {
    license_number: licenseNumber,
    entity_name: entityName,
    rmo_name: String(body.rmo_name || body.rmoName || live.name || '').trim() || live.name || '',
    classification: String(body.classification || '').trim() || '',
    business_address: String(body.business_address || body.businessAddress || '').trim() || '',
    workers_comp_status:
      String(body.workers_comp_status || body.workersCompStatus || '').trim() || 'UNKNOWN',
    onboarding_step: 'company',
    onboarding_completed_at: null
  };

  if (body.license_expire_date || body.licenseExpireDate) {
    insertRow.license_expire_date = body.license_expire_date || body.licenseExpireDate;
  }

  const { data: license, error: insertErr } = await supabase
    .from('licenses')
    .insert([insertRow])
    .select(LICENSE_SELECT)
    .single();

  if (insertErr || !license) {
    const msg = insertErr?.message || 'Failed to create license';
    const isDup = /unique|duplicate/i.test(msg);
    return NextResponse.json(
      {
        error: isDup ? 'A company with this license number already exists' : msg,
        hint: isDup
          ? 'Apply supabase/migrations/007_license_number_unique.sql if not yet applied'
          : undefined
      },
      { status: isDup ? 409 : 500 }
    );
  }

  const licenseId = String((license as unknown as { id: string }).id);

  const { error: membershipErr } = await supabase.from('user_licenses').upsert(
    [{ user_id: live.userId, license_id: licenseId, role: 'RMO' }],
    { onConflict: 'user_id,license_id,role' }
  );

  if (membershipErr) {
    // Roll back orphan license so create is atomic from the caller's POV
    await supabase.from('licenses').delete().eq('id', licenseId);
    return NextResponse.json(
      { error: membershipErr.message || 'Failed to attach RMO membership' },
      { status: 500 }
    );
  }

  // Keep firm portfolio in sync with RMO membership (same as migration 004 backfill)
  const { data: existingAssoc } = await supabase
    .from('qualifier_firm_associations')
    .select('id')
    .eq('user_id', live.userId)
    .eq('license_id', licenseId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (!existingAssoc) {
    await supabase.from('qualifier_firm_associations').insert([
      {
        user_id: live.userId,
        license_id: licenseId,
        eligibility_basis: 'PRIMARY',
        status: 'ACTIVE'
      }
    ]);
  }

  const updatedMemberships = await loadMemberships(live.userId);
  const refreshed = {
    ...live,
    licenseIds: membershipLicenseIds(updatedMemberships),
    role: (rolesForUser(updatedMemberships, live.role)[0] || live.role) as typeof live.role
  };
  const token = createSessionToken(refreshed);

  const licenseRow = license as unknown as Record<string, unknown>;
  const checklist = onboardingChecklist(
    licenseRow as Parameters<typeof onboardingChecklist>[0]
  );

  const res = NextResponse.json({
    ok: true,
    created: true,
    license_id: licenseId,
    license: licenseRow,
    checklist,
    complete: false,
    can_edit: true,
    can_create: true,
    licenses: licenseOptionsFromMemberships(updatedMemberships)
  });

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14
  });

  return res;
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
    'workers_comp_status',
    'license_expire_date',
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
