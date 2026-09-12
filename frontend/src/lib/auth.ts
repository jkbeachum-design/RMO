import { cookies } from 'next/headers';
import {
  LEGACY_PILOT_EMAIL,
  PILOT_EMAIL,
  PILOT_NAME,
  SESSION_COOKIE
} from './constants';
import {
  canUseMode,
  loadMemberships,
  membershipLicenseIds,
  rolesForUser
} from './access';
import { hashPassword, verifyPassword } from './password';
import { createSessionToken, parseSessionToken } from './session';
import { getSupabaseAdmin } from './supabase';
import type { AppMode, SessionUser, UserRole } from './types';

export {
  LEGACY_PILOT_EMAIL,
  PILOT_EMAIL,
  PILOT_NAME,
  COMPLIANCE_PHONE,
  COMPLIANCE_PHONE_DISPLAY,
  SESSION_COOKIE
} from './constants';

export { createSessionToken, parseSessionToken } from './session';

export function getPilotPassword(): string {
  return process.env.PILOT_PASSWORD || 'rmo-pilot';
}

export function getSession(): SessionUser | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return parseSessionToken(token);
}

export function requireSession(mode?: AppMode): SessionUser {
  const session = getSession();
  if (!session) {
    throw new Error('UNAUTHORIZED');
  }
  if (mode && session.mode !== mode) {
    throw new Error('FORBIDDEN');
  }
  return session;
}

type DbUser = {
  id: string;
  user_email: string;
  user_name: string;
  role: string | null;
  license_id: string | null;
  password_hash: string | null;
  is_active: boolean | null;
};

async function findUserByEmail(email: string): Promise<DbUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('id, user_email, user_name, role, license_id, password_hash, is_active')
    .ilike('user_email', email)
    .maybeSingle();

  if (error) {
    // password_hash / is_active may not exist until migration — retry lean select
    const { data: lean, error: leanError } = await supabase
      .from('users')
      .select('id, user_email, user_name, role, license_id')
      .ilike('user_email', email)
      .maybeSingle();
    if (leanError || !lean) return null;
    return { ...lean, password_hash: null, is_active: true };
  }
  return data as DbUser | null;
}

/**
 * Ensure pilot user + memberships exist for migration from allowlist auth.
 * Idempotent. Uses service role (trusted bootstrap only).
 */
export async function ensurePilotBootstrap(): Promise<DbUser | null> {
  const supabase = getSupabaseAdmin();
  let user = await findUserByEmail(PILOT_EMAIL);

  // Remap legacy jonathan@ seed → jbeachum@ if the corrected email row is missing
  if (!user) {
    const legacy = await findUserByEmail(LEGACY_PILOT_EMAIL);
    if (legacy) {
      await supabase
        .from('users')
        .update({ user_email: PILOT_EMAIL, user_name: PILOT_NAME })
        .eq('id', legacy.id);
      user = { ...legacy, user_email: PILOT_EMAIL, user_name: PILOT_NAME };
    }
  }

  if (!user) {
    const { data: licenses } = await supabase
      .from('licenses')
      .select('id, license_number')
      .in('license_number', ['836089', '1160775']);

    const homeLicense = licenses?.find((l) => l.license_number === '836089') || licenses?.[0];
    const password_hash = hashPassword(getPilotPassword());

    const { data: created, error } = await supabase
      .from('users')
      .insert([
        {
          user_email: PILOT_EMAIL,
          user_name: PILOT_NAME,
          role: 'RMO',
          license_id: homeLicense?.id || null,
          password_hash,
          is_active: true,
          phone_number: null
        }
      ])
      .select('id, user_email, user_name, role, license_id, password_hash, is_active')
      .single();

    if (error || !created) {
      console.error('Pilot user bootstrap failed:', error?.message);
      return null;
    }
    user = created as DbUser;

    if (licenses?.length) {
      for (const lic of licenses) {
        await supabase.from('user_licenses').upsert(
          { user_id: user.id, license_id: lic.id, role: 'RMO' },
          { onConflict: 'user_id,license_id,role' }
        );
        // Pilot also exercises operator flows in demos
        await supabase.from('user_licenses').upsert(
          { user_id: user.id, license_id: lic.id, role: 'OPERATOR' },
          { onConflict: 'user_id,license_id,role' }
        );
      }
    }
  } else if (!user.password_hash) {
    const password_hash = hashPassword(getPilotPassword());
    await supabase.from('users').update({ password_hash }).eq('id', user.id);
    user = { ...user, password_hash };
  }

  // Ensure memberships for known pilot licenses
  const { data: licenses } = await supabase
    .from('licenses')
    .select('id, license_number')
    .in('license_number', ['836089', '1160775']);

  if (licenses?.length) {
    for (const lic of licenses) {
      await supabase.from('user_licenses').upsert(
        { user_id: user.id, license_id: lic.id, role: 'RMO' },
        { onConflict: 'user_id,license_id,role' }
      );
      await supabase.from('user_licenses').upsert(
        { user_id: user.id, license_id: lic.id, role: 'OPERATOR' },
        { onConflict: 'user_id,license_id,role' }
      );
    }
  }

  return user;
}

export async function authenticateUser(
  emailRaw: string,
  password: string,
  requestedMode?: AppMode
): Promise<{ user: SessionUser } | { error: string; status: number }> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) {
    return { error: 'Email and password required', status: 400 };
  }

  // Migration: ensure pilot row exists when logging in as pilot
  if (email === PILOT_EMAIL) {
    await ensurePilotBootstrap();
  }

  let user = await findUserByEmail(email);
  if (!user || user.is_active === false) {
    return { error: 'Invalid email or password', status: 401 };
  }

  let passwordOk = verifyPassword(password, user.password_hash);
  // One-time migration path: pilot password from env when hash missing / mismatch during cutover
  if (!passwordOk && email === PILOT_EMAIL && password === getPilotPassword()) {
    passwordOk = true;
    const password_hash = hashPassword(password);
    await getSupabaseAdmin().from('users').update({ password_hash }).eq('id', user.id);
    user = { ...user, password_hash };
  }

  if (!passwordOk) {
    return { error: 'Invalid email or password', status: 401 };
  }

  const memberships = await loadMemberships(user.id);
  const licenseIds = membershipLicenseIds(memberships);
  if (!licenseIds.length) {
    return {
      error: 'No company memberships for this account. Contact your RMO admin.',
      status: 403
    };
  }

  const accountRole = (String(user.role || 'OPERATOR').toUpperCase() as UserRole) || 'OPERATOR';
  const available = rolesForUser(memberships, accountRole);
  let mode: AppMode = requestedMode === 'OPERATOR' ? 'OPERATOR' : 'RMO';
  if (!canUseMode(memberships, mode)) {
    mode = canUseMode(memberships, 'RMO') ? 'RMO' : 'OPERATOR';
  }

  const sessionUser: SessionUser = {
    userId: user.id,
    email: user.user_email,
    name: user.user_name || user.user_email,
    role: (available.includes(accountRole) ? accountRole : available[0]) as UserRole,
    mode,
    licenseIds
  };

  return { user: sessionUser };
}

export async function refreshSessionMemberships(session: SessionUser): Promise<SessionUser> {
  const memberships = await loadMemberships(session.userId);
  return {
    ...session,
    licenseIds: membershipLicenseIds(memberships)
  };
}
