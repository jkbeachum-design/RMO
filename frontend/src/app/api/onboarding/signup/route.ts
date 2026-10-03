import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  createSessionToken,
  getSession
} from '@/lib/auth';
import { buildSessionUser } from '@/lib/authSession';
import { validateNewPassword } from '@/lib/passwordPolicy';
import {
  isValidLicenseNumber,
  normalizeLicenseNumber
} from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ensureSupabaseAuthUser } from '@/lib/supabaseAuth';

const LICENSE_SELECT = [
  'id',
  'license_number',
  'entity_name',
  'classification',
  'workers_comp_status',
  'rmo_name',
  'business_address',
  'onboarding_completed_at',
  'onboarding_step'
].join(', ');

/**
 * Public RMO self-onboarding: confirm RMO role, create Auth + app user,
 * create first company membership, return signed session + login credentials reminder.
 */
export async function POST(req: Request) {
  const existing = getSession();
  if (existing) {
    return NextResponse.json(
      {
        error: 'Already signed in. Open company onboarding from the dashboard.',
        redirect: existing.mode === 'OPERATOR' ? '/operator' : '/dashboard/onboarding'
      },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const confirmRmo = body.confirm_rmo === true || body.confirmRmo === true;
  if (!confirmRmo) {
    return NextResponse.json(
      { error: 'Confirm that you are the RMO to set up this account' },
      { status: 400 }
    );
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '')
    .trim()
    .toLowerCase();
  const password = String(body.password || '');
  const licenseNumber = normalizeLicenseNumber(body.license_number || body.licenseNumber);
  const entityName = String(body.entity_name || body.entityName || '').trim();

  if (!name) {
    return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
  }
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  const pw = validateNewPassword(password);
  if (!pw.ok) {
    return NextResponse.json({ error: pw.error }, { status: 400 });
  }
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

  const { data: existingUser } = await supabase
    .from('users')
    .select('id, user_email')
    .ilike('user_email', email)
    .maybeSingle();
  if (existingUser) {
    return NextResponse.json(
      {
        error: 'An account with this email already exists. Sign in instead.',
        redirect: '/'
      },
      { status: 409 }
    );
  }

  const { data: existingLicense } = await supabase
    .from('licenses')
    .select('id, license_number')
    .eq('license_number', licenseNumber)
    .maybeSingle();
  if (existingLicense) {
    return NextResponse.json(
      {
        error:
          'A company with this license number already exists. Ask that company’s RMO to invite you, or sign in if you already have access.'
      },
      { status: 409 }
    );
  }

  let authUserId: string;
  try {
    const ensured = await ensureSupabaseAuthUser({ email, password, name });
    authUserId = ensured.authUserId;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to create login credentials'
      },
      { status: 500 }
    );
  }

  const { data: createdUser, error: userErr } = await supabase
    .from('users')
    .insert([
      {
        user_email: email,
        user_name: name,
        role: 'RMO',
        auth_user_id: authUserId,
        is_active: true,
        license_id: null
      }
    ])
    .select('id, user_email, user_name, role')
    .single();

  if (userErr || !createdUser) {
    return NextResponse.json(
      { error: userErr?.message || 'Failed to create RMO user' },
      { status: 500 }
    );
  }

  const insertRow: Record<string, unknown> = {
    license_number: licenseNumber,
    entity_name: entityName,
    rmo_name: name,
    classification: String(body.classification || '').trim() || '',
    business_address: String(body.business_address || body.businessAddress || '').trim() || '',
    workers_comp_status:
      String(body.workers_comp_status || body.workersCompStatus || '').trim() || 'UNKNOWN',
    onboarding_step: 'company',
    onboarding_completed_at: null
  };

  const { data: license, error: licenseErr } = await supabase
    .from('licenses')
    .insert([insertRow])
    .select(LICENSE_SELECT)
    .single();

  if (licenseErr || !license) {
    await supabase.from('users').delete().eq('id', createdUser.id);
    const msg = licenseErr?.message || 'Failed to create company';
    const isDup = /unique|duplicate/i.test(msg);
    return NextResponse.json(
      {
        error: isDup ? 'A company with this license number already exists' : msg
      },
      { status: isDup ? 409 : 500 }
    );
  }

  const licenseId = String((license as unknown as { id: string }).id);

  const { error: membershipErr } = await supabase.from('user_licenses').upsert(
    [{ user_id: createdUser.id, license_id: licenseId, role: 'RMO' }],
    { onConflict: 'user_id,license_id,role' }
  );

  if (membershipErr) {
    await supabase.from('licenses').delete().eq('id', licenseId);
    await supabase.from('users').delete().eq('id', createdUser.id);
    return NextResponse.json(
      { error: membershipErr.message || 'Failed to assign RMO role' },
      { status: 500 }
    );
  }

  await supabase
    .from('users')
    .update({ license_id: licenseId, updated_at: new Date().toISOString() })
    .eq('id', createdUser.id);

  const { data: existingAssoc } = await supabase
    .from('qualifier_firm_associations')
    .select('id')
    .eq('user_id', createdUser.id)
    .eq('license_id', licenseId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (!existingAssoc) {
    await supabase.from('qualifier_firm_associations').insert([
      {
        user_id: createdUser.id,
        license_id: licenseId,
        eligibility_basis: 'PRIMARY',
        status: 'ACTIVE'
      }
    ]);
  }

  const sessionUser = buildSessionUser({
    userId: createdUser.id,
    email: createdUser.user_email,
    name: createdUser.user_name || name,
    accountRole: 'RMO',
    memberships: [{ license_id: licenseId, role: 'RMO' }]
  });
  const token = createSessionToken(sessionUser);

  const res = NextResponse.json({
    ok: true,
    role: 'RMO',
    credentials: {
      email,
      // Password is the one the RMO just chose — echo only a reminder, never re-store.
      password_set: true,
      hint: 'Sign in anytime with this email and the password you just created.'
    },
    user: {
      email: sessionUser.email,
      name: sessionUser.name,
      mode: sessionUser.mode,
      role: sessionUser.role,
      licenseIds: sessionUser.licenseIds
    },
    license_id: licenseId,
    license,
    next: '/dashboard/onboarding'
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
