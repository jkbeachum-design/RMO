import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_ALERT_EMAIL_BLOCKLIST,
  filterAlertEmails,
  filterAlertPhones,
  filterAlertRecipients,
  normalizeEmail
} = require('../src/alertRecipients.js');

const ERIC = 'ERICJ379@gmail.com';
const JONATHAN = 'jbeachum@buildmyoffice.com';

describe('alert recipient allowlist/blocklist', () => {
  const saved = {};

  beforeEach(() => {
    for (const key of [
      'ALERT_EMAIL_ALLOWLIST',
      'ALERT_EMAIL_BLOCKLIST',
      'ALERT_PHONE_ALLOWLIST',
      'ALERT_PHONE_BLOCKLIST'
    ]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('hard-codes Eric on the email blocklist', () => {
    assert.ok(
      DEFAULT_ALERT_EMAIL_BLOCKLIST.map((e) => e.toLowerCase()).includes('ericj379@gmail.com')
    );
  });

  it('strips Eric and keeps Jonathan when allowlist is Jonathan-only (notify/digest path)', () => {
    process.env.ALERT_EMAIL_ALLOWLIST = JONATHAN;

    // Mimic contacts resolved from user_licenses (Eric ADMIN + Jonathan RMO)
    // plus license alert fields / RMO_ALERT_EMAIL extras
    const resolved = [ERIC, JONATHAN, 'other-admin@example.com', 'Jonathan@BuildMyOffice.com'];
    const filtered = filterAlertEmails(resolved);

    assert.deepEqual(filtered, [normalizeEmail(JONATHAN)]);
    assert.ok(!filtered.some((e) => e.includes('eric')));
  });

  it('blocks Eric even when allowlist is unset (hard-coded pilot safety)', () => {
    const filtered = filterAlertEmails([ERIC, JONATHAN, 'Someone@Example.com']);
    assert.deepEqual(filtered.sort(), [normalizeEmail(JONATHAN), 'someone@example.com'].sort());
    assert.ok(!filtered.includes(normalizeEmail(ERIC)));
  });

  it('is case-insensitive for Eric block and allowlist match', () => {
    process.env.ALERT_EMAIL_ALLOWLIST = 'JBeachum@BuildMyOffice.com';
    const filtered = filterAlertEmails(['ericj379@GMAIL.com', 'JBEACHUM@BUILDMYOFFICE.COM']);
    assert.deepEqual(filtered, [normalizeEmail(JONATHAN)]);
  });

  it('merges env email blocklist with hard-coded Eric', () => {
    process.env.ALERT_EMAIL_BLOCKLIST = 'temp@example.com';
    const filtered = filterAlertEmails([ERIC, JONATHAN, 'temp@example.com']);
    assert.deepEqual(filtered, [normalizeEmail(JONATHAN)]);
  });

  it('filterAlertRecipients applies email + phone rules together', () => {
    process.env.ALERT_EMAIL_ALLOWLIST = JONATHAN;
    process.env.ALERT_PHONE_ALLOWLIST = '+15551112222';

    const out = filterAlertRecipients({
      emails: [ERIC, JONATHAN],
      phones: ['+15551112222', '+15559998888']
    });

    assert.deepEqual(out.emails, [normalizeEmail(JONATHAN)]);
    assert.deepEqual(out.phones, ['+15551112222']);
  });

  it('phone allowlist mode drops non-allowlisted numbers', () => {
    process.env.ALERT_PHONE_ALLOWLIST = '+15551112222';
    const phones = filterAlertPhones(['+1 (555) 999-8888', '+15551112222']);
    assert.deepEqual(phones, ['+15551112222']);
  });
});
