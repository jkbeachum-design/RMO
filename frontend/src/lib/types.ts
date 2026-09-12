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
  }>;
  subcontractors?: Array<{
    company_name?: string;
    cslb_license_number?: string | null;
    trade?: string;
    coi_expiration_date?: string | null;
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
