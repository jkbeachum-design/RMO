import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLE_DEFINITIONS,
  roleHasCapability,
  canManageTeam,
  onboardingChecklist,
  onboardingComplete,
  nextOnboardingStep
} from '../frontend/src/lib/roles.ts';

describe('roles matrix + onboarding helpers', () => {
  it('gives RMO/ADMIN manage_team and OPERATOR field-only caps', () => {
    assert.equal(roleHasCapability('RMO', 'manage_team'), true);
    assert.equal(roleHasCapability('ADMIN', 'manage_team'), true);
    assert.equal(roleHasCapability('OPERATOR', 'manage_team'), false);
    assert.equal(roleHasCapability('OPERATOR', 'submit_operator_reports'), true);
    assert.equal(roleHasCapability('PM', 'log_supervision'), true);
    assert.equal(ROLE_DEFINITIONS.length, 5);
    assert.equal(canManageTeam(['OPERATOR']), false);
    assert.equal(canManageTeam(['ADMIN']), true);
  });

  it('requires full onboarding checklist before complete', () => {
    const incomplete = onboardingChecklist({
      entity_name: 'Acme',
      ownership_pct: null,
      duty_statement: 'short',
      contractor_bond_status: null,
      association_docs_url: null
    });
    assert.equal(onboardingComplete(incomplete), false);

    const complete = onboardingChecklist({
      entity_name: 'Acme Builders',
      ownership_pct: 25,
      duty_statement: 'RMO oversees all contracts, site visits, and compliance decisions weekly.',
      contractor_bond_status: 'ACTIVE',
      association_docs_url: 'https://example.com/docs'
    });
    assert.equal(onboardingComplete(complete), true);
    assert.equal(nextOnboardingStep('company'), 'ownership');
    assert.equal(nextOnboardingStep('review'), null);
  });
});
