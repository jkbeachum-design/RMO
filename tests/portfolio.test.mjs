import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  associationsInRollingYear,
  buildDisassociationDeadlines,
  clockAlertLevel,
  firmLimitStatus,
  FIRM_LIMIT_MAX
} from '../frontend/src/lib/portfolio.ts';

describe('firm portfolio §7068.1 / §7068.2', () => {
  const now = new Date('2026-09-12T12:00:00Z');

  it('counts associations in the rolling one-year window toward the 3-firm cap', () => {
    const associations = [
      {
        id: '1',
        license_id: 'a',
        eligibility_basis: 'PRIMARY',
        associated_at: '2026-01-01T00:00:00Z',
        status: 'ACTIVE'
      },
      {
        id: '2',
        license_id: 'b',
        eligibility_basis: 'OWNERSHIP_20',
        associated_at: '2026-03-01T00:00:00Z',
        status: 'ACTIVE'
      },
      {
        id: '3',
        license_id: 'c',
        eligibility_basis: 'SUBSIDIARY_JV',
        associated_at: '2025-10-01T00:00:00Z',
        disassociated_at: '2026-02-01T00:00:00Z',
        status: 'DISASSOCIATED'
      },
      {
        id: '4',
        license_id: 'd',
        eligibility_basis: 'SAME_OFFICERS',
        associated_at: '2025-01-01T00:00:00Z',
        status: 'DISASSOCIATED'
      }
    ];

    const inWindow = associationsInRollingYear(associations, now);
    assert.equal(inWindow.length, 3);
    const status = firmLimitStatus(associations, now);
    assert.equal(status.used, 3);
    assert.equal(status.remaining, 0);
    assert.equal(status.atLimit, true);
    assert.equal(status.max, FIRM_LIMIT_MAX);
  });

  it('builds 90-day notify and replace deadlines on disassociation', () => {
    const { notify_deadline, replace_deadline } = buildDisassociationDeadlines(
      '2026-09-12T00:00:00Z'
    );
    assert.equal(notify_deadline.toISOString().slice(0, 10), '2026-12-11');
    assert.equal(replace_deadline.toISOString().slice(0, 10), '2026-12-11');
  });

  it('escalates clock alert levels as deadlines approach', () => {
    assert.equal(clockAlertLevel('2026-12-12', null, now), 'ok');
    assert.equal(clockAlertLevel('2026-10-01', null, now), 'warning');
    assert.equal(clockAlertLevel('2026-09-20', null, now), 'critical');
    assert.equal(clockAlertLevel('2026-09-01', null, now), 'overdue');
    assert.equal(clockAlertLevel('2026-09-01', '2026-09-05', now), 'ok');
  });
});
