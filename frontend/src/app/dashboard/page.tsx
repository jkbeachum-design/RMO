import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import AppShell from '@/components/AppShell';
import ComplianceLogTable from '@/components/ComplianceLogTable';
import LicenseSwitcher from '@/components/LicenseSwitcher';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds, resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ComplianceLog, License } from '@/lib/types';

async function loadDashboard(sessionLicenseIds: string[], licenseNumber?: string) {
  if (!sessionLicenseIds.length) return null;

  const supabase = getSupabaseAdmin();
  const { data: licenses } = await supabase
    .from('licenses')
    .select(
      'id, license_number, entity_name, workers_comp_status, license_expire_date, classification'
    )
    .in('id', sessionLicenseIds)
    .order('license_number');

  const list = (licenses || []) as License[];
  if (!list.length) return null;

  const license =
    (licenseNumber && list.find((l) => l.license_number === licenseNumber)) || list[0];

  const { data: fullLicense } = await supabase
    .from('licenses')
    .select('*')
    .eq('id', license.id)
    .single();

  if (!fullLicense) return null;

  const { data: logs } = await supabase
    .from('compliance_logs')
    .select('*')
    .eq('license_id', license.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const { count: logCount } = await supabase
    .from('compliance_logs')
    .select('*', { count: 'exact', head: true })
    .eq('license_id', license.id);

  const { count: projectCount } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('license_id', license.id)
    .eq('status', 'ACTIVE');

  return {
    license: fullLicense as License,
    licenses: list,
    logs: (logs || []) as ComplianceLog[],
    logCount: logCount || 0,
    activeProjects: projectCount || 0
  };
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams: { license?: string };
}) {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');

  const live = await refreshSessionMemberships(session);
  const memberships = await loadMemberships(live.userId);
  const licenseIds = membershipLicenseIds(memberships);

  const resolved = await resolveAccessibleLicense(live, searchParams.license);
  if (!resolved) {
    return (
      <AppShell mode="RMO" name={session.name}>
        <p>No company memberships found for your account.</p>
      </AppShell>
    );
  }

  const data = await loadDashboard(licenseIds, resolved.license.license_number);
  if (!data) {
    return (
      <AppShell mode="RMO" name={session.name}>
        <p>License not found or access denied.</p>
      </AppShell>
    );
  }

  const licenseNumber = data.license.license_number;
  const flagged = data.logs.filter((l) => l.risk_flags?.flagged).length;
  const critical = data.logs.filter((l) => (l.risk_flags?.critical_flags || []).length > 0).length;

  return (
    <AppShell mode="RMO" name={session.name}>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">RMO Dashboard</p>
          <h1 className="font-serif text-4xl text-slate-900">{data.license.entity_name}</h1>
          <p className="mt-1 text-slate-600">
            License #{data.license.license_number} · {data.license.classification} · WC{' '}
            {data.license.workers_comp_status}
          </p>
        </div>
        <Suspense fallback={null}>
          <LicenseSwitcher licenses={data.licenses} current={licenseNumber} />
        </Suspense>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active projects</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{data.activeProjects}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Compliance logs</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{data.logCount}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Flagged (recent)</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-amber-800">{flagged}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Critical (recent)</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-red-800">{critical}</p>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Recent compliance logs</h2>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/audit-report?license=${licenseNumber}`}
            className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#163838]"
          >
            Monthly audit
          </Link>
          <Link
            href={`/dashboard/compliance-log?license=${licenseNumber}`}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Full log
          </Link>
        </div>
      </div>

      <ComplianceLogTable logs={data.logs} />
    </AppShell>
  );
}
