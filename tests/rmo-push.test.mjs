import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RMO_TITLE_PREFIX,
  buildReminderEmailPush,
  buildRemindersOffPush,
  claimMemoryDedupe,
  formatNtfyTitle,
  isReminderDeliveryFailure,
  recordFailedLoginAttempt,
  sanitizeNtfyTitle,
  shouldNotifyRemindersOff
} from '../frontend/src/lib/rmoAlertFormat.ts';
import { stepForToday } from '../frontend/src/lib/reportReminderSchedule.ts';

describe('ntfy title prefix + sanitizer', () => {
  it('prefixes [RMO] and keeps ASCII sanitizer', () => {
    assert.equal(formatNtfyTitle('New report - Acme'), '[RMO] New report - Acme');
    assert.ok(formatNtfyTitle('Hello').startsWith(RMO_TITLE_PREFIX));
    // Non-ASCII replaced with '-'
    const dirty = formatNtfyTitle('Alert café — test');
    assert.match(dirty, /^\[RMO\] /);
    assert.equal(dirty.includes('é'), false);
    assert.equal(dirty.includes('—'), false);
  });

  it('does not double-prefix', () => {
    assert.equal(formatNtfyTitle('[RMO] Already'), '[RMO] Already');
    assert.equal(sanitizeNtfyTitle('plain'), 'plain');
  });

  it('truncates to 200 chars after prefix', () => {
    const long = 'x'.repeat(250);
    assert.ok(formatNtfyTitle(long).length <= 200);
  });
});

describe('push dedupe (memory)', () => {
  it('claims a key once, then duplicates', () => {
    const store = new Map();
    assert.equal(claimMemoryDedupe('a:1', undefined, store).claimed, true);
    assert.equal(claimMemoryDedupe('a:1', undefined, store).claimed, false);
    assert.equal(claimMemoryDedupe('a:1', undefined, store).reason, 'duplicate');
  });

  it('re-claims after dedupeHours window', () => {
    const store = new Map();
    const t0 = 1_000_000;
    assert.equal(claimMemoryDedupe('k', 1, store, t0).claimed, true);
    assert.equal(claimMemoryDedupe('k', 1, store, t0 + 30 * 60 * 1000).claimed, false);
    assert.equal(claimMemoryDedupe('k', 1, store, t0 + 2 * 60 * 60 * 1000).claimed, true);
  });
});

describe('reminder email failure → high priority RMO push', () => {
  it('marks delivery failures as high + warning', () => {
    assert.equal(isReminderDeliveryFailure('no_recipients'), true);
    assert.equal(isReminderDeliveryFailure('send_failed'), true);
    assert.equal(isReminderDeliveryFailure('email_not_configured'), true);
    assert.equal(isReminderDeliveryFailure('network'), true);
    assert.equal(isReminderDeliveryFailure('ok'), false);

    const fail = buildReminderEmailPush({
      operatorName: 'Eric',
      dueDate: '2026-10-22',
      companyName: 'Vanguard',
      outcome: 'failed',
      reason: 'send_failed'
    });
    assert.equal(fail.priority, 'high');
    assert.equal(fail.tags, 'warning');
    assert.match(fail.title, /Reminder NOT delivered to Eric - send_failed/);

    const ok = buildReminderEmailPush({
      operatorName: 'Eric',
      dueDate: '2026-10-22',
      outcome: 'sent'
    });
    assert.equal(ok.priority, 'low');
    assert.equal(ok.tags, 'email');
    assert.match(ok.title, /Reminder emailed to Eric - due 2026-10-22/);
  });
});

describe('due_today step', () => {
  it('returns due_today on the due date (push-only step)', () => {
    assert.equal(stepForToday('2026-10-22', '2026-10-19'), 'due_soon');
    assert.equal(stepForToday('2026-10-22', '2026-10-22'), 'due_today');
    assert.equal(stepForToday('2026-10-22', '2026-10-23'), 'past_due');
    assert.equal(stepForToday('2026-10-22', '2026-10-25'), 'overdue_3d');
    assert.equal(stepForToday('2026-10-22', '2026-10-29'), 'overdue_7d');
  });
});

describe('reminders-off detection', () => {
  it('notifies only when reminders are off and CEOs exist', () => {
    assert.equal(shouldNotifyRemindersOff(false, 1), true);
    assert.equal(shouldNotifyRemindersOff(false, 2), true);
    assert.equal(shouldNotifyRemindersOff(false, 0), false);
    assert.equal(shouldNotifyRemindersOff(true, 1), false);

    const push = buildRemindersOffPush({
      companyName: 'VANGUARD PROPERTY MAINTENANCE INC',
      operatorName: 'Eric'
    });
    assert.match(push.title, /Reminders are OFF for VANGUARD/);
    assert.match(push.title, /Eric gets no nudges/);
    assert.equal(push.tags, 'no_bell');
    assert.equal(push.priority, 'default');
  });
});

describe('failed login attempt counter', () => {
  it('counts three failures within 15 minutes', () => {
    const store = new Map();
    const t0 = Date.now();
    assert.equal(recordFailedLoginAttempt('ceo@example.com', t0, 15 * 60 * 1000, store), 1);
    assert.equal(
      recordFailedLoginAttempt('ceo@example.com', t0 + 60_000, 15 * 60 * 1000, store),
      2
    );
    assert.equal(
      recordFailedLoginAttempt('ceo@example.com', t0 + 120_000, 15 * 60 * 1000, store),
      3
    );
  });
});
