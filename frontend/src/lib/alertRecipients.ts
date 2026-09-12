/**
 * Central allowlist/blocklist for outbound alert email & SMS.
 * Self-contained copy for Next.js (Vercel rootDirectory=frontend).
 * Keep behavior identical to repo-root `src/alertRecipients.js`.
 *
 * Safety defaults for pilot testing:
 * - ERICJ379@gmail.com is always blocklisted (any case), even if env unset
 * - When ALERT_EMAIL_ALLOWLIST is set, ONLY those addresses may receive mail
 */

/** Hard-coded pilot safety — never email Eric during testing */
export const DEFAULT_ALERT_EMAIL_BLOCKLIST: readonly string[] = Object.freeze([
  'ericj379@gmail.com'
]);

export function parseCsvEnv(value: string | undefined | null): string[] {
  if (value == null || !String(value).trim()) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeEmail(email: string): string {
  return String(email || '')
    .trim()
    .toLowerCase();
}

export function normalizePhone(phone: string): string {
  return String(phone || '')
    .trim()
    .replace(/[^\d+]/g, '');
}

function emailBlocklist(env: NodeJS.ProcessEnv = process.env): string[] {
  const fromEnv = parseCsvEnv(env.ALERT_EMAIL_BLOCKLIST).map(normalizeEmail);
  return [...new Set([...DEFAULT_ALERT_EMAIL_BLOCKLIST, ...fromEnv])];
}

function emailAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseCsvEnv(env.ALERT_EMAIL_ALLOWLIST).map(normalizeEmail);
}

function phoneBlocklist(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseCsvEnv(env.ALERT_PHONE_BLOCKLIST).map(normalizePhone);
}

function phoneAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseCsvEnv(env.ALERT_PHONE_ALLOWLIST).map(normalizePhone);
}

/**
 * Filter outbound email recipients.
 * Blocklist always applies (includes hard-coded Eric). When allowlist is
 * non-empty, only allowlisted addresses pass.
 */
export function filterAlertEmails(
  emails: Iterable<string> | string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const raw = Array.isArray(emails)
    ? emails
    : emails == null || emails === ''
      ? []
      : typeof emails === 'string'
        ? emails.split(',')
        : [...emails];

  const allow = emailAllowlist(env);
  const block = new Set(emailBlocklist(env));
  const allowSet = allow.length > 0 ? new Set(allow) : null;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const email = normalizeEmail(item);
    if (!email || seen.has(email)) continue;
    seen.add(email);

    if (block.has(email)) {
      console.log(`ALERT recipient blocked: ${email} (blocklist)`);
      continue;
    }
    if (allowSet && !allowSet.has(email)) {
      console.log(`ALERT recipient blocked: ${email} (allowlist)`);
      continue;
    }
    out.push(email);
  }

  return out;
}

/**
 * Filter outbound SMS recipients.
 * When ALERT_PHONE_ALLOWLIST is set, only those numbers may be texted.
 * Blocklist always applies. Unknown / empty entries are dropped.
 */
export function filterAlertPhones(
  phones: Iterable<string> | string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const raw = Array.isArray(phones)
    ? phones
    : phones == null || phones === ''
      ? []
      : typeof phones === 'string'
        ? phones.split(',')
        : [...phones];

  const allow = phoneAllowlist(env);
  const block = new Set(phoneBlocklist(env));
  const allowSet = allow.length > 0 ? new Set(allow) : null;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const trimmed = String(item || '').trim();
    if (!trimmed) continue;
    const key = normalizePhone(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    if (block.has(key)) {
      console.log(`ALERT SMS recipient blocked: ${trimmed} (blocklist)`);
      continue;
    }
    if (allowSet && !allowSet.has(key)) {
      console.log(`ALERT SMS recipient blocked: ${trimmed} (allowlist)`);
      continue;
    }
    out.push(trimmed);
  }

  return out;
}

export function filterAlertRecipients(
  contacts: {
    emails?: Iterable<string> | string | null;
    phones?: Iterable<string> | string | null;
  },
  env: NodeJS.ProcessEnv = process.env
): { emails: string[]; phones: string[] } {
  return {
    emails: filterAlertEmails(contacts?.emails, env),
    phones: filterAlertPhones(contacts?.phones, env)
  };
}
