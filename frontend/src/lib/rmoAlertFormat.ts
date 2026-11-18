/**
 * Pure ntfy / RMO push helpers (no Supabase) — safe for node:test.
 */

export type NtfyPriority = 'min' | 'low' | 'default' | 'high' | 'urgent';

export const RMO_TITLE_PREFIX = '[RMO] ';

/** ASCII-only Title sanitizer used by ntfy headers. */
export function sanitizeNtfyTitle(title: string): string {
  return title.replace(/[^\x20-\x7E]/g, '-').slice(0, 200);
}

/** Ensure Title starts with `[RMO] ` then sanitize for the ntfy header. */
export function formatNtfyTitle(title: string): string {
  const trimmed = String(title || '').trim();
  const withPrefix = trimmed.startsWith(RMO_TITLE_PREFIX)
    ? trimmed
    : `${RMO_TITLE_PREFIX}${trimmed.replace(/^\[RMO\]\s*/i, '')}`;
  return sanitizeNtfyTitle(withPrefix);
}

/** Reminder email delivery → RMO push copy. */
export function buildReminderEmailPush(input: {
  operatorName: string;
  dueDate: string;
  companyName?: string;
  outcome: 'sent' | 'failed';
  reason?: string;
}): { title: string; priority: NtfyPriority; tags: string; message: string } {
  if (input.outcome === 'sent') {
    return {
      title: `Reminder emailed to ${input.operatorName} - due ${input.dueDate}`,
      priority: 'low',
      tags: 'email',
      message: [
        `CEO reminder email delivered to ${input.operatorName}.`,
        `Due: ${input.dueDate}.`,
        input.companyName ? `Company: ${input.companyName}.` : null,
        'Open Supervision for status.'
      ]
        .filter(Boolean)
        .join('\n')
    };
  }
  const reason = input.reason || 'unknown';
  return {
    title: `Reminder NOT delivered to ${input.operatorName} - ${reason}`,
    priority: 'high',
    tags: 'warning',
    message: [
      `CEO reminder email was not delivered to ${input.operatorName}.`,
      `Reason: ${reason}.`,
      `Due: ${input.dueDate}.`,
      input.companyName ? `Company: ${input.companyName}.` : null
    ]
      .filter(Boolean)
      .join('\n')
  };
}

export const REMINDER_FAILURE_REASONS = [
  'no_recipients',
  'send_failed',
  'email_not_configured',
  'network'
] as const;

export function isReminderDeliveryFailure(skipped?: string | null): boolean {
  return Boolean(skipped && (REMINDER_FAILURE_REASONS as readonly string[]).includes(skipped));
}

/** Pure: reminders-off push is warranted when the toggle is off and CEOs exist. */
export function shouldNotifyRemindersOff(
  reminderEnabled: boolean,
  activeCeoCount: number
): boolean {
  return !reminderEnabled && activeCeoCount > 0;
}

export function buildRemindersOffPush(input: {
  companyName: string;
  operatorName: string;
}): { title: string; priority: NtfyPriority; tags: string; message: string } {
  return {
    title: `Reminders are OFF for ${input.companyName} - ${input.operatorName} gets no nudges`,
    priority: 'default',
    tags: 'no_bell',
    message: [
      `Required-report reminders are disabled for ${input.companyName}.`,
      `${input.operatorName} will not receive due_soon / past_due emails.`,
      'Enable reminders under Rules & digests if this is unintentional.'
    ].join('\n')
  };
}

/** Test / pure helper: record or check a dedupe key against an in-memory map. */
export function claimMemoryDedupe(
  key: string,
  dedupeHours?: number,
  store: Map<string, number> = new Map(),
  nowMs: number = Date.now()
): { claimed: boolean; reason?: 'duplicate' } {
  const prev = store.get(key);
  if (prev != null) {
    if (dedupeHours == null || dedupeHours <= 0) {
      return { claimed: false, reason: 'duplicate' };
    }
    const ageHours = (nowMs - prev) / (60 * 60 * 1000);
    if (ageHours < dedupeHours) return { claimed: false, reason: 'duplicate' };
  }
  store.set(key, nowMs);
  return { claimed: true };
}

export function recordFailedLoginAttempt(
  email: string,
  nowMs: number = Date.now(),
  windowMs: number = 15 * 60 * 1000,
  store: Map<string, number[]> = new Map()
): number {
  const key = email.trim().toLowerCase();
  const times = (store.get(key) || []).filter((t) => nowMs - t < windowMs);
  times.push(nowMs);
  store.set(key, times);
  return times.length;
}
