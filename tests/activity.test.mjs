import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isActivityEventType,
  reportActivityStatus,
  shortUserAgent,
  formatPacific
} from '../frontend/src/lib/activity.ts';

describe('activity helpers', () => {
  it('validates event types', () => {
    assert.equal(isActivityEventType('app_open'), true);
    assert.equal(isActivityEventType('sign_in'), true);
    assert.equal(isActivityEventType('report_started'), true);
    assert.equal(isActivityEventType('report_submitted'), true);
    assert.equal(isActivityEventType('page_view'), true);
    assert.equal(isActivityEventType('hack'), false);
  });

  it('maps days-since-report to green/amber/red using low_involvement_days (default 7/14)', () => {
    assert.equal(reportActivityStatus(0, 14), 'green');
    assert.equal(reportActivityStatus(6, 14), 'green');
    assert.equal(reportActivityStatus(7, 14), 'amber');
    assert.equal(reportActivityStatus(13, 14), 'amber');
    assert.equal(reportActivityStatus(14, 14), 'red');
    assert.equal(reportActivityStatus(null, 14), 'red');
    // Custom threshold 10 → amber at 5
    assert.equal(reportActivityStatus(4, 10), 'green');
    assert.equal(reportActivityStatus(5, 10), 'amber');
    assert.equal(reportActivityStatus(10, 10), 'red');
  });

  it('shortens user agents', () => {
    assert.equal(shortUserAgent(null), null);
    assert.equal(shortUserAgent('Mozilla/5.0'), 'Mozilla/5.0');
    const long = 'x'.repeat(300);
    const short = shortUserAgent(long);
    assert.ok(short && short.length <= 180);
    assert.ok(short.endsWith('…'));
  });

  it('formats Pacific times without throwing', () => {
    assert.equal(formatPacific(null), 'Never');
    assert.equal(formatPacific('not-a-date'), 'Never');
    const formatted = formatPacific('2026-10-01T20:00:00.000Z');
    assert.ok(typeof formatted === 'string' && formatted.length > 4);
    assert.notEqual(formatted, 'Never');
  });
});
