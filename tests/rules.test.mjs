import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COMPLIANCE_SETTINGS,
  isLowInvolvement,
  mergeComplianceSettings,
  daysSince
} from '../frontend/src/lib/rules.ts';

describe('configurable rules + low involvement', () => {
  it('merges partial settings over defaults', () => {
    const s = mergeComplianceSettings({ contract_value_threshold: 25000, low_involvement_days: 7 });
    assert.equal(s.contract_value_threshold, 25000);
    assert.equal(s.low_involvement_days, 7);
    assert.equal(s.permit_required_above, DEFAULT_COMPLIANCE_SETTINGS.permit_required_above);
  });

  it('flags low involvement when no activity or stale activity', () => {
    const now = new Date('2026-09-12T12:00:00Z');
    assert.equal(isLowInvolvement(null, 14, now), true);
    assert.equal(isLowInvolvement('2026-09-10T00:00:00Z', 14, now), false);
    assert.equal(isLowInvolvement('2026-08-01T00:00:00Z', 14, now), true);
    assert.equal(daysSince('2026-09-05T00:00:00Z', now), 7);
  });
});
