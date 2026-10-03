import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_DEFINITIONS } from '../frontend/src/lib/roles.ts';
import {
  normalizeProjectStatus,
  projectStatusLabel
} from '../frontend/src/lib/projectStatus.ts';

describe('CEO display labels', () => {
  it('labels stored OPERATOR role as CEO in the roles matrix', () => {
    const operator = ROLE_DEFINITIONS.find((r) => r.role === 'OPERATOR');
    assert.ok(operator);
    assert.equal(operator.label, 'CEO');
    const rmo = ROLE_DEFINITIONS.find((r) => r.role === 'RMO');
    assert.ok(rmo);
    assert.match(rmo.label, /Responsible Managing Officer/i);
  });

  it('normalizes project statuses for small jobs', () => {
    assert.equal(normalizeProjectStatus('on_hold'), 'ON_HOLD');
    assert.equal(projectStatusLabel('ON_HOLD'), 'On hold');
    assert.equal(normalizeProjectStatus('weird'), 'ACTIVE');
  });
});
