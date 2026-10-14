/**
 * Review flags (risk_flags, risk counts, RMO review status/notes) are for the
 * RMO only. Anything returned to a CEO/operator session must go through these
 * helpers so flags are stripped server-side, not just hidden in the UI.
 */

const LOG_RMO_ONLY_KEYS = [
  'risk_flags',
  'risk_count',
  'rmo_reviewed',
  'rmo_reviewed_at',
  'rmo_notes'
] as const;

function redactExtracted(extracted: unknown): unknown {
  if (!extracted || typeof extracted !== 'object') return extracted;
  const copy = { ...(extracted as Record<string, unknown>) };
  delete copy.audit_summary;
  delete copy.risk_flags;
  return copy;
}

export function redactLogForOperator<T>(log: T): T {
  if (!log || typeof log !== 'object') return log;
  const copy = { ...(log as Record<string, unknown>) };
  for (const key of LOG_RMO_ONLY_KEYS) delete copy[key];
  if ('extracted_data' in copy) copy.extracted_data = redactExtracted(copy.extracted_data);
  return copy as T;
}

export function redactLogsForOperator<T>(logs: T[] | null | undefined): T[] {
  return (logs || []).map((l) => redactLogForOperator(l));
}

/** Backend responses (submit / correction) proxied to the CEO portal. */
export function redactBackendResponseForOperator(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const copy = { ...(payload as Record<string, unknown>) };
  for (const key of ['risk_flags', 'risk_count', 'riskFlags', 'flags', 'critical_flags', 'warning_flags']) {
    delete copy[key];
  }
  if (copy.log) copy.log = redactLogForOperator(copy.log);
  if (copy.extracted_data) copy.extracted_data = redactExtracted(copy.extracted_data);
  return copy;
}
