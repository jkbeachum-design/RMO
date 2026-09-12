import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Membership-scoped audit defense package payload.
 * Client turns this into multi-page PDF + ZIP.
 */
export async function GET(req: Request) {
  const session = getSession();
  if (!session || session.mode !== 'RMO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const { searchParams } = new URL(req.url);
  const licenseNumber = searchParams.get('license_number');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const license = resolved.license;
  const supabase = getSupabaseAdmin();

  const end = to ? new Date(to) : new Date();
  const start = from
    ? new Date(from)
    : new Date(end.getFullYear(), end.getMonth(), 1);

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [
    { data: logs },
    { data: activities },
    { data: projects },
    { data: auditReports }
  ] = await Promise.all([
    supabase
      .from('compliance_logs')
      .select('*')
      .eq('license_id', license.id)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: true }),
    supabase
      .from('supervision_activities')
      .select('*')
      .eq('license_id', license.id)
      .gte('occurred_at', startIso)
      .lte('occurred_at', endIso)
      .order('occurred_at', { ascending: true }),
    supabase
      .from('projects')
      .select('*')
      .eq('license_id', license.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('monthly_audit_reports')
      .select('*')
      .eq('license_id', license.id)
      .order('audit_month', { ascending: false })
      .limit(12)
  ]);

  const logList = logs || [];
  const reviewed = logList.filter((l) => l.rmo_reviewed);
  const flagged = logList.filter((l) => l.risk_flags?.flagged);
  const critical = logList.filter(
    (l) => (l.risk_flags?.critical_flags || []).length > 0
  );

  const packageJson = {
    generated_at: new Date().toISOString(),
    generated_by: {
      userId: live.userId,
      email: live.email,
      name: live.name
    },
    range: { from: startIso, to: endIso },
    license: {
      id: license.id,
      license_number: license.license_number,
      entity_name: license.entity_name,
      classification: license.classification,
      workers_comp_status: license.workers_comp_status,
      rmo_name: license.rmo_name,
      license_expire_date: license.license_expire_date,
      business_address: license.business_address || null
    },
    summary: {
      compliance_logs: logList.length,
      reviewed_acks: reviewed.length,
      flagged_logs: flagged.length,
      critical_logs: critical.length,
      supervision_activities: (activities || []).length,
      projects: (projects || []).length,
      signed_audit_months: (auditReports || []).length
    },
    duty_statement: license.duty_statement || `RMO of record: ${license.rmo_name || 'n/a'}. Classification: ${
      license.classification || 'n/a'
    }.`,
    supervision_activities: activities || [],
    compliance_logs: logList,
    acknowledgements: reviewed.map((l) => ({
      log_id: l.id,
      reviewed_at: l.rmo_reviewed_at || l.updated_at || l.created_at,
      notes: l.rmo_notes,
      call_timestamp: l.call_timestamp,
      source_type: l.source_type
    })),
    projects: projects || [],
    monthly_audit_reports: auditReports || []
  };

  return NextResponse.json({ package: packageJson });
}
