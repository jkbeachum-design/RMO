import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLE_DEFINITIONS,
  roleHasCapability,
  canManageTeam,
  canCreateCompany,
  normalizeLicenseNumber,
  isValidLicenseNumber,
  onboardingChecklist,
  onboardingComplete,
  nextOnboardingStep
} from '../frontend/src/lib/roles.ts';

/** Mirrors access.canCreateCompanies / canManageLicenseTeam without pulling Supabase. */
function canCreateCompanies(memberships) {
  return memberships.some((m) => m.role === 'RMO' || m.role === 'ADMIN');
}

function canManageLicenseTeam(memberships, licenseId) {
  return memberships.some(
    (m) => m.license_id === licenseId && (m.role === 'RMO' || m.role === 'ADMIN')
  );
}

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

  it('allows RMO/ADMIN to create companies; forbids operator-class', () => {
    assert.equal(canCreateCompany(['RMO']), true);
    assert.equal(canCreateCompany(['ADMIN']), true);
    assert.equal(canCreateCompany(['RMO', 'OPERATOR']), true);
    assert.equal(canCreateCompany(['OPERATOR']), false);
    assert.equal(canCreateCompany(['PM', 'FOREMAN']), false);
    assert.equal(canCreateCompany([]), false);

    const rmoMemberships = [
      { license_id: 'a', role: 'RMO' },
      { license_id: 'b', role: 'OPERATOR' }
    ];
    const operatorOnly = [{ license_id: 'a', role: 'OPERATOR' }];
    assert.equal(canCreateCompanies(rmoMemberships), true);
    assert.equal(canCreateCompanies(operatorOnly), false);
    assert.equal(canManageLicenseTeam(rmoMemberships, 'a'), true);
    assert.equal(canManageLicenseTeam(rmoMemberships, 'b'), false);
    assert.equal(canManageLicenseTeam(operatorOnly, 'a'), false);
  });

  it('normalizes and validates CSLB license numbers', () => {
    assert.equal(normalizeLicenseNumber('  836089  '), '836089');
    assert.equal(normalizeLicenseNumber('1160 775'), '1160775');
    assert.equal(isValidLicenseNumber('836089'), true);
    assert.equal(isValidLicenseNumber('1160775'), true);
    assert.equal(isValidLicenseNumber('abc'), false);
    assert.equal(isValidLicenseNumber('12'), false);
    assert.equal(isValidLicenseNumber(''), false);
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
