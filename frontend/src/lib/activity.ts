/** Client + shared helpers for operator portal activity logging. */

export const ACTIVITY_EVENTS = [
  'app_open',
  'page_view',
  'sign_in',
  'report_started',
  'report_submitted'
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENTS)[number];

export type ActivityStatus = 'green' | 'amber' | 'red';

const APP_OPEN_DEDUP_MS = 30 * 60 * 1000;
const APP_OPEN_STORAGE_KEY = 'rmo_activity_app_open_at';
const UA_MAX = 180;

export function shortUserAgent(ua?: string | null): string | null {
  if (!ua) return null;
  const trimmed = ua.trim();
  if (!trimmed) return null;
  return trimmed.length > UA_MAX ? `${trimmed.slice(0, UA_MAX - 1)}…` : trimmed;
}

export function isActivityEventType(value: unknown): value is ActivityEventType {
  return typeof value === 'string' && (ACTIVITY_EVENTS as readonly string[]).includes(value);
}

/**
 * Days-since-last-report status.
 * Red threshold = compliance_settings.low_involvement_days (default 14).
 * Amber threshold = half of red (default 7). Green below amber.
 */
export function reportActivityStatus(
  daysSinceReport: number | null,
  lowInvolvementDays: number = 14
): ActivityStatus {
  const red = Number.isFinite(lowInvolvementDays) && lowInvolvementDays > 0 ? lowInvolvementDays : 14;
  const amber = Math.max(1, Math.floor(red / 2));
  if (daysSinceReport == null) return 'red';
  if (daysSinceReport >= red) return 'red';
  if (daysSinceReport >= amber) return 'amber';
  return 'green';
}

export function formatPacific(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(d);
}

export type LogActivityInput = {
  event: ActivityEventType;
  licenseId?: string | null;
  licenseNumber?: string | null;
  path?: string | null;
  /** ISO timestamp — preserved for offline flush. */
  createdAt?: string | null;
};

/**
 * Fire-and-forget activity log. Never throws; never blocks the UI.
 * Queues offline when the network is unavailable.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    if (typeof window === 'undefined') return;

    if (input.event === 'app_open') {
      try {
        const prev = sessionStorage.getItem(APP_OPEN_STORAGE_KEY);
        const prevMs = prev ? Number(prev) : 0;
        if (prevMs && Date.now() - prevMs < APP_OPEN_DEDUP_MS) return;
        sessionStorage.setItem(APP_OPEN_STORAGE_KEY, String(Date.now()));
      } catch {
        /* sessionStorage may be blocked */
      }
    }

    const payload = {
      event: input.event,
      licenseId: input.licenseId || null,
      licenseNumber: input.licenseNumber || null,
      path: input.path || (typeof window !== 'undefined' ? window.location.pathname : null),
      userAgent: shortUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : null),
      createdAt: input.createdAt || new Date().toISOString()
    };

    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline) {
      const { enqueueActivityEvent } = await import('./offlineQueue');
      await enqueueActivityEvent(payload);
      return;
    }

    const res = await fetch('/api/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      // Soft-fail: queue for later if it looks like a network issue
      if (res.status >= 500 || res.status === 0) {
        const { enqueueActivityEvent } = await import('./offlineQueue');
        await enqueueActivityEvent(payload);
      }
    }
  } catch {
    try {
      const { enqueueActivityEvent, isNetworkError } = await import('./offlineQueue');
      // Always queue on failure so we don't lose the event silently when offline-ish
      await enqueueActivityEvent({
        event: input.event,
        licenseId: input.licenseId || null,
        licenseNumber: input.licenseNumber || null,
        path: input.path || null,
        userAgent: shortUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : null),
        createdAt: input.createdAt || new Date().toISOString()
      });
      void isNetworkError;
    } catch {
      /* never break the UI */
    }
  }
}

/** Mark that report_started already fired this form session. */
export function markReportStartedOnce(key = 'rmo_activity_report_started'): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(key) === '1') return false;
    sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return true;
  }
}
