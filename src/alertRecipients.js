/**
 * Central allowlist/blocklist for outbound alert email & SMS.
 * Used by Express (notifyRMO, digests).
 * Next.js keeps a behavior-identical copy at `frontend/src/lib/alertRecipients.ts`
 * (Vercel rootDirectory=frontend cannot import this parent file).
 *
 * Safety defaults for pilot testing:
 * - ERICJ379@gmail.com is always blocklisted (any case), even if env unset
 * - When ALERT_EMAIL_ALLOWLIST is set, ONLY those addresses may receive mail
 */

'use strict';

/** @type {readonly string[]} Hard-coded pilot safety — never email Eric during testing */
const DEFAULT_ALERT_EMAIL_BLOCKLIST = Object.freeze(['ericj379@gmail.com']);

/**
 * @param {string | undefined | null} value
 * @returns {string[]}
 */
function parseCsvEnv(value) {
  if (value == null || !String(value).trim()) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

/**
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  return String(phone || '')
    .trim()
    .replace(/[^\d+]/g, '');
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function emailBlocklist(env = process.env) {
  const fromEnv = parseCsvEnv(env.ALERT_EMAIL_BLOCKLIST).map(normalizeEmail);
  return [...new Set([...DEFAULT_ALERT_EMAIL_BLOCKLIST, ...fromEnv])];
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function emailAllowlist(env = process.env) {
  return parseCsvEnv(env.ALERT_EMAIL_ALLOWLIST).map(normalizeEmail);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function phoneBlocklist(env = process.env) {
  return parseCsvEnv(env.ALERT_PHONE_BLOCKLIST).map(normalizePhone);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function phoneAllowlist(env = process.env) {
  return parseCsvEnv(env.ALERT_PHONE_ALLOWLIST).map(normalizePhone);
}

/**
 * Filter outbound email recipients.
 * Blocklist always applies (includes hard-coded Eric). When allowlist is
 * non-empty, only allowlisted addresses pass.
 *
 * @param {Iterable<string> | string | null | undefined} emails
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]} normalized emails that may be contacted
 */
function filterAlertEmails(emails, env = process.env) {
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
  const out = [];
  const seen = new Set();

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
 *
 * @param {Iterable<string> | string | null | undefined} phones
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]} phones that may be contacted (original trimmed form preferred)
 */
function filterAlertPhones(phones, env = process.env) {
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
  const out = [];
  const seen = new Set();

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

/**
 * @param {{ emails?: Iterable<string> | string | null, phones?: Iterable<string> | string | null }} contacts
 * @param {NodeJS.ProcessEnv} [env]
 */
function filterAlertRecipients(contacts, env = process.env) {
  return {
    emails: filterAlertEmails(contacts?.emails, env),
    phones: filterAlertPhones(contacts?.phones, env)
  };
}

module.exports = {
  DEFAULT_ALERT_EMAIL_BLOCKLIST,
  parseCsvEnv,
  normalizeEmail,
  normalizePhone,
  filterAlertEmails,
  filterAlertPhones,
  filterAlertRecipients
};
