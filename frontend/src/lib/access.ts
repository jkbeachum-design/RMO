import { getSupabaseAdmin } from './supabase';
import type { SessionUser, UserRole } from './types';

export type Membership = {
  license_id: string;
  role: UserRole;
  licenses?: {
    id: string;
    license_number: string;
    entity_name: string;
    classification?: string;
    workers_comp_status?: string;
    license_expire_date?: string;
  } | null;
};

export async function loadMemberships(userId: string): Promise<Membership[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_licenses')
    .select(
      'license_id, role, licenses(id, license_number, entity_name, classification, workers_comp_status, license_expire_date)'
    )
    .eq('user_id', userId);

  if (error) {
    // Table may not exist yet — fall back to legacy users.license_id
    console.warn('user_licenses lookup failed, trying legacy users.license_id:', error.message);
    return loadLegacyMemberships(userId);
  }

  return (data || []) as unknown as Membership[];
}

async function loadLegacyMemberships(userId: string): Promise<Membership[]> {
  const supabase = getSupabaseAdmin();
  const { data: user } = await supabase
    .from('users')
    .select(
      'id, role, license_id, licenses(id, license_number, entity_name, classification, workers_comp_status, license_expire_date)'
    )
    .eq('id', userId)
    .maybeSingle();

  if (!user?.license_id) return [];
  const licenseRow = Array.isArray(user.licenses) ? user.licenses[0] : user.licenses;
  return [
    {
      license_id: user.license_id,
      role: (String(user.role || 'OPERATOR').toUpperCase() as UserRole) || 'OPERATOR',
      licenses: (licenseRow as Membership['licenses']) || null
    }
  ];
}

export function membershipLicenseIds(memberships: Membership[]): string[] {
  return Array.from(new Set(memberships.map((m) => m.license_id)));
}

export function rolesForUser(memberships: Membership[], fallback?: UserRole): UserRole[] {
  const roles = Array.from(new Set(memberships.map((m) => m.role)));
  if (!roles.length && fallback) return [fallback];
  return roles;
}

export function canUseMode(memberships: Membership[], mode: UserRole): boolean {
  const roles = rolesForUser(memberships);
  if (mode === 'RMO') return roles.includes('RMO') || roles.includes('ADMIN');
  if (mode === 'OPERATOR') return roles.includes('OPERATOR') || roles.includes('FOREMAN') || roles.includes('PM');
  return roles.includes(mode);
}

/** Roles the user holds on a specific license. */
export function rolesOnLicense(memberships: Membership[], licenseId: string): UserRole[] {
  return Array.from(
    new Set(memberships.filter((m) => m.license_id === licenseId).map((m) => m.role))
  );
}

/** True if memberships include RMO or ADMIN for the given license. */
export function canManageLicenseTeam(memberships: Membership[], licenseId: string): boolean {
  const roles = rolesOnLicense(memberships, licenseId);
  return roles.includes('RMO') || roles.includes('ADMIN');
}

/** True if the session user may access this license UUID. */
export function sessionHasLicenseId(session: SessionUser, licenseId: string): boolean {
  return (session.licenseIds || []).includes(licenseId);
}

export async function resolveAccessibleLicense(
  session: SessionUser,
  licenseNumber: string | null | undefined
): Promise<{
  license: {
    id: string;
    license_number: string;
    entity_name: string;
    classification: string;
    workers_comp_status: string;
    license_expire_date: string;
    rmo_name?: string;
    business_address?: string;
    duty_statement?: string | null;
  };
  memberships: Membership[];
} | null> {
  const memberships = await loadMemberships(session.userId);
  const allowedIds = new Set(membershipLicenseIds(memberships));
  if (!allowedIds.size) return null;

  const supabase = getSupabaseAdmin();
  const { data: licenses } = await supabase
    .from('licenses')
    .select('*')
    .in('id', Array.from(allowedIds))
    .order('license_number');

  const list = licenses || [];
  if (!list.length) return null;

  const selected =
    (licenseNumber && list.find((l) => l.license_number === licenseNumber)) || list[0];

  if (!selected || !allowedIds.has(selected.id)) return null;

  return { license: selected, memberships };
}

export async function assertLogAccess(
  session: SessionUser,
  logId: string
): Promise<{ id: string; license_id: string } | null> {
  const supabase = getSupabaseAdmin();
  const { data: log } = await supabase
    .from('compliance_logs')
    .select('id, license_id')
    .eq('id', logId)
    .maybeSingle();

  if (!log) return null;
  if (!sessionHasLicenseId(session, log.license_id)) {
    // Refresh memberships in case session cookie is stale
    const memberships = await loadMemberships(session.userId);
    if (!membershipLicenseIds(memberships).includes(log.license_id)) return null;
  }
  return log;
}
