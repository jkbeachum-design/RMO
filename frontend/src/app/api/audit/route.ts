import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const { searchParams } = new URL(req.url);
  const licenseNumber = searchParams.get('license_number');

  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const license = resolved.license;
  const supabase = getSupabaseAdmin();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const auditMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const { data: logs } = await supabase
    .from('compliance_logs')
    .select('*')
    .eq('license_id', license.id)
    .gte('created_at', monthStart.toISOString())
    .order('created_at', { ascending: false });

  const list = logs || [];
  const report = {
    month: monthStart.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
    audit_month: auditMonth,
    total_calls: list.length,
    total_flags: list.filter((l) => l.risk_flags?.flagged).length,
    critical_flags: list.filter((l) => (l.risk_flags?.critical_flags || []).length > 0).length,
    logs: list
  };

  return NextResponse.json({ license, report });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session || session.mode !== 'RMO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const body = await req.json().catch(() => ({}));
  const licenseNumber = body.license_number || null;
  const notes = body.notes || '';
  const signature = body.signature || null;
  const reportJson = body.report_json || null;

  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const auditMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('monthly_audit_reports')
    .upsert(
      {
        license_id: resolved.license.id,
        audit_month: auditMonth,
        total_calls: reportJson?.total_calls || 0,
        total_reports: reportJson?.total_calls || 0,
        risk_flags_count: reportJson?.total_flags || 0,
        report_json: { ...reportJson, notes },
        rmo_reviewed_at: new Date().toISOString(),
        rmo_signed_at: signature ? new Date().toISOString() : null,
        rmo_signature_url: signature,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'license_id,audit_month' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ report: data });
}
