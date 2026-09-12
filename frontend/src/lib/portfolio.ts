/**
 * CSLB B&P §7068.1 / §7068.2 portfolio helpers (pure — covered by unit tests).
 */

export type EligibilityBasis =
  | 'PRIMARY'
  | 'OWNERSHIP_20'
  | 'SUBSIDIARY_JV'
  | 'SAME_OFFICERS'
  | 'OTHER';

export type FirmAssociation = {
  id: string;
  license_id: string;
  eligibility_basis: EligibilityBasis;
  ownership_pct?: number | null;
  associated_at: string;
  disassociated_at?: string | null;
  status: 'ACTIVE' | 'DISASSOCIATED' | 'PENDING';
  license_number?: string;
  entity_name?: string;
  classification?: string;
};

export type DisassociationClock = {
  id: string;
  association_id: string;
  license_id: string;
  disassociated_at: string;
  notify_deadline: string;
  replace_deadline: string;
  notify_completed_at?: string | null;
  replace_completed_at?: string | null;
  license_number?: string;
  entity_name?: string;
};

const MS_DAY = 24 * 60 * 60 * 1000;
export const FIRM_LIMIT_WINDOW_DAYS = 365;
export const FIRM_LIMIT_MAX = 3;
export const DISASSOCIATION_CLOCK_DAYS = 90;

export function addDays(iso: string | Date, days: number): Date {
  const d = new Date(iso);
  d.setTime(d.getTime() + days * MS_DAY);
  return d;
}

export function daysBetween(from: string | Date, to: string | Date = new Date()): number {
  const a = new Date(from);
  const b = new Date(to);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}

export function daysRemaining(deadline: string | Date, now: Date = new Date()): number {
  return -daysBetween(deadline, now);
}

export function associationsInRollingYear(
  associations: FirmAssociation[],
  now: Date = new Date()
): FirmAssociation[] {
  const cutoff = new Date(now.getTime() - FIRM_LIMIT_WINDOW_DAYS * MS_DAY);
  return associations.filter((a) => {
    const start = new Date(a.associated_at);
    return start >= cutoff && start <= now;
  });
}

export function firmLimitStatus(associations: FirmAssociation[], now: Date = new Date()) {
  const inWindow = associationsInRollingYear(associations, now);
  const active = associations.filter((a) => a.status === 'ACTIVE');
  const used = inWindow.length;
  const remaining = Math.max(0, FIRM_LIMIT_MAX - used);
  return {
    used,
    remaining,
    max: FIRM_LIMIT_MAX,
    windowDays: FIRM_LIMIT_WINDOW_DAYS,
    atLimit: used >= FIRM_LIMIT_MAX,
    nearLimit: used >= FIRM_LIMIT_MAX - 1,
    activeCount: active.length,
    inWindow
  };
}

export function eligibilityLabel(basis: EligibilityBasis): string {
  switch (basis) {
    case 'PRIMARY':
      return 'Primary firm';
    case 'OWNERSHIP_20':
      return '≥20% common ownership';
    case 'SUBSIDIARY_JV':
      return 'Subsidiary / JV';
    case 'SAME_OFFICERS':
      return 'Majority same officers';
    default:
      return 'Other / review';
  }
}

export function buildDisassociationDeadlines(disassociatedAt: string | Date = new Date()): {
  notify_deadline: Date;
  replace_deadline: Date;
} {
  return {
    notify_deadline: addDays(disassociatedAt, DISASSOCIATION_CLOCK_DAYS),
    replace_deadline: addDays(disassociatedAt, DISASSOCIATION_CLOCK_DAYS)
  };
}

export type ClockAlertLevel = 'ok' | 'warning' | 'critical' | 'overdue';

export function clockAlertLevel(
  deadline: string,
  completedAt: string | null | undefined,
  now: Date = new Date()
): ClockAlertLevel {
  if (completedAt) return 'ok';
  const left = daysRemaining(deadline, now);
  if (left < 0) return 'overdue';
  if (left <= 14) return 'critical';
  if (left <= 30) return 'warning';
  return 'ok';
}

export function summarizeClocks(clocks: DisassociationClock[], now: Date = new Date()) {
  return clocks.map((c) => ({
    ...c,
    notify_days_left: daysRemaining(c.notify_deadline, now),
    replace_days_left: daysRemaining(c.replace_deadline, now),
    notify_level: clockAlertLevel(c.notify_deadline, c.notify_completed_at, now),
    replace_level: clockAlertLevel(c.replace_deadline, c.replace_completed_at, now)
  }));
}
