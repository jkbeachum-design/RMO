import type { AppMode, SessionUser, UserRole } from './types';

export type MembershipLike = {
  license_id: string;
  role: UserRole;
};

/** RMO-class roles → dashboard; operator-class → PWA. */
export function isRmoClassRole(role: UserRole): boolean {
  return role === 'RMO' || role === 'ADMIN';
}

export function isOperatorClassRole(role: UserRole): boolean {
  return role === 'OPERATOR' || role === 'PM' || role === 'FOREMAN';
}

export function canUseModeFromRoles(roles: UserRole[], mode: AppMode): boolean {
  if (mode === 'RMO') return roles.some(isRmoClassRole);
  return roles.some(isOperatorClassRole);
}

export function rolesFromMemberships(
  memberships: MembershipLike[],
  fallback?: UserRole
): UserRole[] {
  const roles = Array.from(new Set(memberships.map((m) => m.role)));
  if (!roles.length && fallback) return [fallback];
  return roles;
}

/**
 * Choose RMO dashboard vs CEO portal from memberships.
 * Login never picks a mode; `requestedMode` is only for in-session switch-mode.
 * Default when dual-roled: RMO. CEO-only memberships land on OPERATOR (/operator).
 */
export function pickAppMode(
  memberships: MembershipLike[],
  accountRole: UserRole,
  requestedMode?: AppMode
): AppMode {
  const roles = rolesFromMemberships(memberships, accountRole);
  if (requestedMode && canUseModeFromRoles(roles, requestedMode)) {
    return requestedMode;
  }
  if (canUseModeFromRoles(roles, 'RMO')) return 'RMO';
  return 'OPERATOR';
}

export function buildSessionUser(input: {
  userId: string;
  email: string;
  name: string;
  accountRole: UserRole;
  memberships: MembershipLike[];
  requestedMode?: AppMode;
}): SessionUser {
  const available = rolesFromMemberships(input.memberships, input.accountRole);
  const mode = pickAppMode(input.memberships, input.accountRole, input.requestedMode);
  const role = (
    available.includes(input.accountRole) ? input.accountRole : available[0]
  ) as UserRole;

  return {
    userId: input.userId,
    email: input.email,
    name: input.name || input.email,
    role,
    mode,
    licenseIds: Array.from(new Set(input.memberships.map((m) => m.license_id)))
  };
}
