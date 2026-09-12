/** Default + merge helpers for configurable compliance rules. */

export type ComplianceSettings = {
  contract_value_threshold: number;
  permit_required_above: number;
  min_trades_for_b_general: number;
  flag_unverified_subs: boolean;
  flag_expired_coi: boolean;
  flag_workers_comp_exempt_crew: boolean;
  flag_scope_mismatch: boolean;
  flag_missing_permit: boolean;
  low_involvement_days: number;
  digest_enabled: boolean;
  digest_hour_pt: number;
  alert_email?: string | null;
  alert_phone?: string | null;
};

export const DEFAULT_COMPLIANCE_SETTINGS: ComplianceSettings = {
  contract_value_threshold: 10000,
  permit_required_above: 10000,
  min_trades_for_b_general: 3,
  flag_unverified_subs: true,
  flag_expired_coi: true,
  flag_workers_comp_exempt_crew: true,
  flag_scope_mismatch: true,
  flag_missing_permit: true,
  low_involvement_days: 14,
  digest_enabled: true,
  digest_hour_pt: 7,
  alert_email: null,
  alert_phone: null
};

export function mergeComplianceSettings(
  partial?: Partial<ComplianceSettings> | null
): ComplianceSettings {
  return { ...DEFAULT_COMPLIANCE_SETTINGS, ...(partial || {}) };
}

/** Days since an ISO timestamp (calendar days, Pacific-agnostic UTC day math). */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const a = new Date(then);
  const b = new Date(now);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

export function isLowInvolvement(
  lastActivityAt: string | null | undefined,
  thresholdDays: number,
  now: Date = new Date()
): boolean {
  const days = daysSince(lastActivityAt, now);
  if (days == null) return true; // never any activity = low involvement
  return days >= thresholdDays;
}
