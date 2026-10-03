import type { AppMode, UserRole } from './types';
import { roleDefinition } from './roles';

/**
 * User-facing labels. Stored membership role remains OPERATOR; UI shows CEO.
 * Routes stay under /operator for link stability.
 */
export function displayRoleLabel(role: string | null | undefined): string {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'OPERATOR') return 'CEO';
  const def = roleDefinition(normalized as UserRole);
  return def?.label || (role ? String(role) : '—');
}

export function displayModeLabel(mode: AppMode | string | null | undefined): string {
  return mode === 'RMO' ? 'RMO' : 'CEO';
}

export function displayRoleOption(role: UserRole): string {
  return displayRoleLabel(role);
}
