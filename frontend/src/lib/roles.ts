import type { UserRole, AppMode } from './types';

/** Capabilities used by the roles matrix UI and access checks. */
export type Capability =
  | 'view_rmo_dashboard'
  | 'view_operator_pwa'
  | 'manage_team'
  | 'edit_company_profile'
  | 'run_rules_settings'
  | 'acknowledge_logs'
  | 'submit_operator_reports'
  | 'log_supervision'
  | 'export_audit_package'
  | 'manage_portfolio';

export type RoleDefinition = {
  role: UserRole;
  label: string;
  summary: string;
  /** Which UI mode this role can enter. */
  modes: AppMode[];
  capabilities: Capability[];
};

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: 'RMO',
    label: 'Responsible Managing Officer',
    summary: 'Qualifier of record — full compliance dashboard, team, portfolio, and exports.',
    modes: ['RMO'],
    capabilities: [
      'view_rmo_dashboard',
      'manage_team',
      'edit_company_profile',
      'run_rules_settings',
      'acknowledge_logs',
      'log_supervision',
      'export_audit_package',
      'manage_portfolio'
    ]
  },
  {
    role: 'ADMIN',
    label: 'Company admin',
    summary: 'Same dashboard as RMO for day-to-day ops; can manage team and onboarding.',
    modes: ['RMO'],
    capabilities: [
      'view_rmo_dashboard',
      'manage_team',
      'edit_company_profile',
      'run_rules_settings',
      'acknowledge_logs',
      'log_supervision',
      'export_audit_package',
      'manage_portfolio'
    ]
  },
  {
    role: 'PM',
    label: 'Project manager',
    summary: 'Field / project leadership — Operator PWA for check-ins and reports.',
    modes: ['OPERATOR'],
    capabilities: ['view_operator_pwa', 'submit_operator_reports', 'log_supervision']
  },
  {
    role: 'FOREMAN',
    label: 'Foreman',
    summary: 'Jobsite lead — Operator PWA check-ins and report submission.',
    modes: ['OPERATOR'],
    capabilities: ['view_operator_pwa', 'submit_operator_reports']
  },
  {
    role: 'OPERATOR',
    label: 'Operator',
    summary: 'Field operator — voice/PWA check-ins and manual reports only.',
    modes: ['OPERATOR'],
    capabilities: ['view_operator_pwa', 'submit_operator_reports']
  }
];

export const ALL_ROLES: UserRole[] = ROLE_DEFINITIONS.map((r) => r.role);

export const CAPABILITY_LABELS: Record<Capability, string> = {
  view_rmo_dashboard: 'RMO dashboard',
  view_operator_pwa: 'Operator PWA',
  manage_team: 'Manage team & invites',
  edit_company_profile: 'Company onboarding / profile',
  run_rules_settings: 'Rules & digests',
  acknowledge_logs: 'Acknowledge compliance logs',
  submit_operator_reports: 'Submit operator reports',
  log_supervision: 'Log supervision evidence',
  export_audit_package: 'Audit defense export',
  manage_portfolio: 'Firm portfolio & clocks'
};

export function roleDefinition(role: UserRole): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.find((r) => r.role === role);
}

export function roleHasCapability(role: UserRole, capability: Capability): boolean {
  return Boolean(roleDefinition(role)?.capabilities.includes(capability));
}

/** RMO or ADMIN membership can manage team for a company. */
export function canManageTeam(roles: UserRole[]): boolean {
  return roles.some((r) => r === 'RMO' || r === 'ADMIN');
}

export function isRmoClassRole(role: UserRole): boolean {
  return role === 'RMO' || role === 'ADMIN';
}

export function isOperatorClassRole(role: UserRole): boolean {
  return role === 'OPERATOR' || role === 'FOREMAN' || role === 'PM';
}

export type OnboardingStepId =
  | 'company'
  | 'ownership'
  | 'duty'
  | 'bonds'
  | 'docs'
  | 'review';

export const ONBOARDING_STEPS: Array<{ id: OnboardingStepId; title: string; blurb: string }> = [
  {
    id: 'company',
    title: 'Company',
    blurb: 'Confirm CSLB license identity and RMO of record.'
  },
  {
    id: 'ownership',
    title: 'Ownership',
    blurb: 'Ownership %, subsidiary / JV flags, and officers for §7068.1 eligibility.'
  },
  {
    id: 'duty',
    title: 'Duty statement',
    blurb: 'Written duty statement the qualifier will stand behind in an audit.'
  },
  {
    id: 'bonds',
    title: 'Bonds & BQI',
    blurb: 'Contractor bond and Bond Qualification Instrument status / expiry.'
  },
  {
    id: 'docs',
    title: 'Association docs',
    blurb: 'Link to association / qualifying person documents.'
  },
  {
    id: 'review',
    title: 'Review',
    blurb: 'Confirm checklist and mark onboarding complete.'
  }
];

export function nextOnboardingStep(current: OnboardingStepId): OnboardingStepId | null {
  const idx = ONBOARDING_STEPS.findIndex((s) => s.id === current);
  if (idx < 0 || idx >= ONBOARDING_STEPS.length - 1) return null;
  return ONBOARDING_STEPS[idx + 1].id;
}

export type OnboardingChecklist = {
  has_entity: boolean;
  has_ownership: boolean;
  has_duty: boolean;
  has_bond: boolean;
  has_docs: boolean;
};

export function onboardingChecklist(license: {
  entity_name?: string | null;
  ownership_pct?: number | null;
  duty_statement?: string | null;
  contractor_bond_status?: string | null;
  association_docs_url?: string | null;
}): OnboardingChecklist {
  return {
    has_entity: Boolean(license.entity_name && String(license.entity_name).trim()),
    has_ownership: license.ownership_pct != null && Number(license.ownership_pct) >= 0,
    has_duty: Boolean(license.duty_statement && String(license.duty_statement).trim().length >= 40),
    has_bond: Boolean(license.contractor_bond_status && String(license.contractor_bond_status).trim()),
    has_docs: Boolean(license.association_docs_url && String(license.association_docs_url).trim())
  };
}

export function onboardingComplete(checklist: OnboardingChecklist): boolean {
  return (
    checklist.has_entity &&
    checklist.has_ownership &&
    checklist.has_duty &&
    checklist.has_bond &&
    checklist.has_docs
  );
}
