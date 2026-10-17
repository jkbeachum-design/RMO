import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  addDaysYmd,
  buildDueSoonEmail,
  buildFinalNoticeText,
  buildPastDueEmail,
  cadenceStepDays,
  daysBetweenYmd,
  dueSoonYmd,
  listCadenceDueDates,
  overdue3Ymd,
  overdue7Ymd,
  pastDueYmd,
  reportSatisfiesCadenceDue,
  stepForToday
} from '../frontend/src/lib/reportReminderSchedule.ts';

const require = createRequire(import.meta.url);
const {
  filterAlertEmails,
  filterOperatorReminderEmails,
  normalizeEmail
} = require('../src/alertRecipients.js');

const ERIC = 'ERICJ379@gmail.com';
const JONATHAN = 'jbeachum@buildmyoffice.com';

describe('report reminder cadence', () => {
  it('anchors biweekly Thursdays from 2026-10-22', () => {
    assert.equal(cadenceStepDays('biweekly'), 14);
    const dues = listCadenceDueDates('2026-10-22', 'biweekly', '2026-11-30', 90);
    assert.ok(dues.includes('2026-10-22'));
    assert.ok(dues.includes('2026-11-05'));
    assert.ok(dues.includes('2026-11-19'));
    assert.equal(dueSoonYmd('2026-10-22'), '2026-10-19');
    assert.equal(pastDueYmd('2026-10-22'), '2026-10-23');
    assert.equal(overdue3Ymd('2026-10-22'), '2026-10-25');
    assert.equal(overdue7Ymd('2026-10-22'), '2026-10-29');
  });

  it('maps calendar days to reminder steps', () => {
    assert.equal(stepForToday('2026-10-22', '2026-10-19'), 'due_soon');
    assert.equal(stepForToday('2026-10-22', '2026-10-23'), 'past_due');
    assert.equal(stepForToday('2026-10-22', '2026-10-25'), 'overdue_3d');
    assert.equal(stepForToday('2026-10-22', '2026-10-29'), 'overdue_7d');
    assert.equal(stepForToday('2026-10-22', '2026-10-22'), null);
  });

  it('treats a report in the window as satisfying the due date', () => {
    assert.equal(
      reportSatisfiesCadenceDue(['2026-10-20'], '2026-10-22', '2026-10-08'),
      true
    );
    assert.equal(
      reportSatisfiesCadenceDue(['2026-10-08'], '2026-10-22', '2026-10-08'),
      false
    );
    assert.equal(daysBetweenYmd('2026-10-22', '2026-10-25'), 3);
    assert.equal(addDaysYmd('2026-10-22', 3), '2026-10-25');
  });

  it('builds firm required-report copy with company + CSLB from inputs', () => {
    const soon = buildDueSoonEmail({
      operatorName: 'Eric',
      companyName: 'VANGUARD PROPERTY MAINTENANCE INC',
      licenseNumber: '1160775',
      dueDate: '2026-10-22'
    });
    assert.match(soon.subject, /Report due Thursday/);
    assert.match(soon.text, /VANGUARD PROPERTY MAINTENANCE INC/);
    assert.match(soon.text, /1160775/);
    assert.match(soon.text, /required/);

    const past = buildPastDueEmail({
      operatorName: 'Eric',
      companyName: 'VANGUARD PROPERTY MAINTENANCE INC',
      licenseNumber: '1160775',
      dueDate: '2026-10-22'
    });
    assert.match(past.subject, /Past due/);
    assert.match(past.text, /noted on the compliance record/);

    const finalText = buildFinalNoticeText({
      operatorName: 'Eric',
      operatorEmail: ERIC,
      companyName: 'VANGUARD PROPERTY MAINTENANCE INC',
      licenseNumber: '1160775',
      dueDate: '2026-10-22',
      daysOverdue: 7
    });
    assert.match(finalText, /Final notice/);
    assert.match(finalText, /ERICJ379@gmail.com/i);
  });
});

describe('operator reminder email filter lifts Eric only for reminders', () => {
  const saved = {};

  beforeEach(() => {
    for (const key of ['ALERT_EMAIL_ALLOWLIST', 'ALERT_EMAIL_BLOCKLIST']) {
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

  it('still blocks Eric on normal alert path', () => {
    process.env.ALERT_EMAIL_ALLOWLIST = JONATHAN;
    const filtered = filterAlertEmails([ERIC, JONATHAN]);
    assert.deepEqual(filtered, [normalizeEmail(JONATHAN)]);
  });

  it('allows Eric on operator reminder path even with Jonathan-only allowlist', () => {
    process.env.ALERT_EMAIL_ALLOWLIST = JONATHAN;
    const filtered = filterOperatorReminderEmails([ERIC]);
    assert.deepEqual(filtered, [normalizeEmail(ERIC)]);
  });

  it('still respects env email blocklist on operator reminders', () => {
    process.env.ALERT_EMAIL_BLOCKLIST = 'temp@example.com';
    const filtered = filterOperatorReminderEmails([ERIC, 'temp@example.com']);
    assert.deepEqual(filtered, [normalizeEmail(ERIC)]);
  });
});
