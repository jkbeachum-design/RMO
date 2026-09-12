export type UserRole = 'RMO' | 'OPERATOR' | 'ADMIN' | 'PM' | 'FOREMAN';

/** UI surface: RMO dashboard vs Operator PWA. Derived from membership roles. */
export type AppMode = 'RMO' | 'OPERATOR';

export type RiskFlag = {
  flag: string;
  reason: string;
  severity?: string;
  address?: string;
  subcontractor?: string;
  statement?: string;
  trades?: string[];
};

export type RiskFlags = {
  flagged?: boolean;
  critical_flags?: string[];
  warning_flags?: string[];
  raw_flags?: RiskFlag[];
};

export type ExtractedData = {
  license_number?: string;
  operator_name?: string;
  projects?: Array<{
    address?: string;
    contract_value?: number | null;
    trades?: string[];
    subcontractors_mentioned?: string[];
    permit_number?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    status?: string;
  }>;
  subcontractors?: Array<{
    company_name?: string;
    cslb_license_number?: string | null;
    trade?: string;
    coi_expiration_date?: string | null;
    coi_document_url?: string | null;
    coi_current?: boolean;
    cslb_verified?: boolean;
  }>;
  crew_status?: {
    has_direct_employees?: boolean;
    employee_count?: number | null;
    raw_statement?: string;
  };
  permits?: Array<{
    project_address?: string;
    permit_number?: string | null;
    permit_status?: string;
  }>;
  file_urls?: {
    cois?: Array<string | { company_name?: string | null; url: string }>;
    permits?: string[];
    photos?: string[];
  };
  notes?: string | null;
  retell_call_id?: string;
  from_number?: string | null;
};

export type License = {
  id: string;
  license_number: string;
  entity_name: string;
  classification: string;
  workers_comp_status: string;
  license_expire_date: string;
  rmo_name: string;
  business_address?: string;
  ownership_pct?: number | null;
  is_subsidiary?: boolean | null;
  is_joint_venture?: boolean | null;
  officers_json?: unknown;
  contractor_bond_status?: string | null;
  contractor_bond_expire_date?: string | null;
  bqi_status?: string | null;
  bqi_expire_date?: string | null;
  duty_statement?: string | null;
  association_docs_url?: string | null;
  onboarding_completed_at?: string | null;
  onboarding_step?: string | null;
};

export type ComplianceLog = {
  id: string;
  license_id: string;
  source_type: string;
  source_channel: string | null;
  raw_payload: string | null;
  call_recording_url: string | null;
  call_duration_seconds: number | null;
  call_timestamp: string | null;
  extracted_data: ExtractedData | null;
  risk_flags: RiskFlags | null;
  compliance_month: string | null;
  rmo_reviewed: boolean;
  rmo_notes: string | null;
  created_at: string;
};

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  /** Primary / account role from users table or strongest membership. */
  role: UserRole;
  /** Active UI mode (RMO dashboard vs Operator PWA). */
  mode: AppMode;
  /** License UUIDs the user may access (cached in session; revalidated on sensitive paths). */
  licenseIds: string[];
};
