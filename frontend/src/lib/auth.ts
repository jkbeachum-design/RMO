import { cookies } from 'next/headers';
import {
  LEGACY_PILOT_EMAIL,
  PILOT_EMAIL,
  PILOT_NAME,
  SESSION_COOKIE
} from './constants';
import {
  loadMemberships,
  membershipLicenseIds
} from './access';
import { buildSessionUser } from './authSession';
import { verifyPassword } from './password';
import { parseSessionToken } from './session';
import { getSupabaseAdmin } from './supabase';
import {
  ensureSupabaseAuthUser,
  signInWithSupabasePassword
} from './supabaseAuth';
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

/**
 * @deprecated PILOT_PASSWORD is no longer used for login.
 * Kept as a no-op export so accidental imports fail loudly in tests if reintroduced.
 */
export function getPilotPassword(): never {
  throw new Error(
    'PILOT_PASSWORD bootstrap is deprecated. Use Supabase Auth (see docs/AUTH.md).'
  );
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
  auth_user_id: string | null;
  is_active: boolean | null;
};

async function findUserByEmail(email: string): Promise<DbUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select(
      'id, user_email, user_name, role, license_id, password_hash, auth_user_id, is_active'
    )
    .ilike('user_email', email)
    .maybeSingle();

  if (error) {
    const { data: lean, error: leanError } = await supabase
      .from('users')
      .select('id, user_email, user_name, role, license_id')
      .ilike('user_email', email)
      .maybeSingle();
    if (leanError || !lean) return null;
    return {
      ...lean,
      password_hash: null,
      auth_user_id: null,
      is_active: true
    };
  }
  return data as DbUser | null;
}

async function findUserByAuthId(authUserId: string): Promise<DbUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select(
      'id, user_email, user_name, role, license_id, password_hash, auth_user_id, is_active'
    )
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error || !data) return null;
  return data as DbUser;
}

async function linkAuthUserId(userId: string, authUserId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('users')
    .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    console.error('Failed to link auth_user_id:', error.message);
  }
}

/**
 * Ensure pilot user + memberships exist (Jonathan Beachum).
 * Does NOT set passwords — Supabase Auth owns credentials.
 * Idempotent. Uses service role (trusted bootstrap only).
 */
export async function ensurePilotBootstrap(): Promise<DbUser | null> {
  const supabase = getSupabaseAdmin();
  let user = await findUserByEmail(PILOT_EMAIL);

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

    const { data: created, error } = await supabase
      .from('users')
      .insert([
        {
          user_email: PILOT_EMAIL,
          user_name: PILOT_NAME,
          role: 'RMO',
          license_id: homeLicense?.id || null,
          is_active: true,
          phone_number: null
        }
      ])
      .select(
        'id, user_email, user_name, role, license_id, password_hash, auth_user_id, is_active'
      )
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
        await supabase.from('user_licenses').upsert(
          { user_id: user.id, license_id: lic.id, role: 'OPERATOR' },
          { onConflict: 'user_id,license_id,role' }
        );
      }
    }
  }

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

/**
 * One-time cutover: if the app user still has a legacy scrypt password_hash and
 * the password matches, create/link a Supabase Auth user with that password.
 * After this, Auth is the source of truth — PILOT_PASSWORD is not consulted.
 */
async function migrateLegacyPasswordToAuth(
  user: DbUser,
  password: string
): Promise<{ authUserId: string } | null> {
  if (!verifyPassword(password, user.password_hash)) {
    return null;
  }
  try {
    const { authUserId } = await ensureSupabaseAuthUser({
      email: user.user_email,
      password,
      name: user.user_name || undefined
    });
    if (!user.auth_user_id || user.auth_user_id !== authUserId) {
      await linkAuthUserId(user.id, authUserId);
    }
    return { authUserId };
  } catch (err) {
    console.error(
      'Legacy password → Auth migration failed:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

async function resolveAppUserAfterAuth(
  authUserId: string,
  email: string
): Promise<DbUser | { error: string; status: number }> {
  let user = await findUserByAuthId(authUserId);
  if (!user) {
    user = await findUserByEmail(email);
  }
  if (!user || user.is_active === false) {
    return {
      error:
        'No RMO Compliance account for this login. Ask your RMO admin to invite you.',
      status: 403
    };
  }
  if (!user.auth_user_id) {
    await linkAuthUserId(user.id, authUserId);
    user = { ...user, auth_user_id: authUserId };
  } else if (user.auth_user_id !== authUserId) {
    console.warn(
      `auth_user_id mismatch for ${email}: stored=${user.auth_user_id} auth=${authUserId}`
    );
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

  if (email === PILOT_EMAIL) {
    await ensurePilotBootstrap();
  }

  let authUserId: string | null = null;

  const authResult = await signInWithSupabasePassword(email, password);
  if ('user' in authResult) {
    authUserId = authResult.user.id;
  } else {
    // Cutover: legacy scrypt hash on users → provision Supabase Auth once
    const existing = await findUserByEmail(email);
    if (!existing || existing.is_active === false) {
      return { error: 'Invalid email or password', status: 401 };
    }
    const migrated = await migrateLegacyPasswordToAuth(existing, password);
    if (!migrated) {
      return { error: 'Invalid email or password', status: 401 };
    }
    authUserId = migrated.authUserId;
  }

  const resolved = await resolveAppUserAfterAuth(authUserId, email);
  if ('error' in resolved) {
    return resolved;
  }
  const user = resolved;

  const memberships = await loadMemberships(user.id);
  const licenseIds = membershipLicenseIds(memberships);
  if (!licenseIds.length) {
    return {
      error: 'No company memberships for this account. Contact your RMO admin.',
      status: 403
    };
  }

  const accountRole =
    (String(user.role || 'OPERATOR').toUpperCase() as UserRole) || 'OPERATOR';

  return {
    user: buildSessionUser({
      userId: user.id,
      email: user.user_email,
      name: user.user_name || user.user_email,
      accountRole,
      memberships,
      requestedMode
    })
  };
}

export async function refreshSessionMemberships(session: SessionUser): Promise<SessionUser> {
  const memberships = await loadMemberships(session.userId);
  return {
    ...session,
    licenseIds: membershipLicenseIds(memberships)
  };
}
