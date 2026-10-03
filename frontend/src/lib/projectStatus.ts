export const PROJECT_STATUSES = ['ACTIVE', 'ON_HOLD', 'COMPLETED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function normalizeProjectStatus(value: unknown): ProjectStatus {
  const raw = String(value || 'ACTIVE').toUpperCase();
  if (raw === 'ON_HOLD' || raw === 'COMPLETED') return raw;
  return 'ACTIVE';
}

export function projectStatusLabel(status: string | null | undefined): string {
  switch (normalizeProjectStatus(status)) {
    case 'ON_HOLD':
      return 'On hold';
    case 'COMPLETED':
      return 'Completed';
    default:
      return 'Active';
  }
}

export function projectStatusClass(status: string | null | undefined): string {
  switch (normalizeProjectStatus(status)) {
    case 'COMPLETED':
      return 'bg-slate-200 text-slate-800';
    case 'ON_HOLD':
      return 'bg-amber-100 text-amber-900';
    default:
      return 'bg-teal-100 text-teal-900';
  }
}
