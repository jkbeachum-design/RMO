import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import AppShell from '@/components/AppShell';
import ComplianceLogTable from '@/components/ComplianceLogTable';
import LicenseSwitcher from '@/components/LicenseSwitcher';
import { getSession } from '@/lib/auth';
import { DEFAULT_LICENSE } from '@/lib/constants';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ComplianceLog, License } from '@/lib/types';

async function loadDashboard(licenseNumber: string) {
  const supabase = getSupabaseAdmin();

  const { data: licenses } = await supabase
    .from('licenses')
    .select('id, license_number, entity_name, workers_comp_status, license_expire_date, classification')
    .order('license_number');

  const { data: license } = await supabase
    .from('licenses')
    .select('*')
    .eq('license_number', licenseNumber)
    .single();

  if (!license) return null;

  const { data: logs } = await supabase
    .from('compliance_logs')
    .select('*')
    .eq('license_id', license.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const { count: projectCount } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('license_id', license.id)
    .eq('status', 'ACTIVE');

  return {
    license: license as License,
    licenses: (licenses || []) as License[],
    logs: (logs || []) as ComplianceLog[],
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

  const licenseNumber = searchParams.license || DEFAULT_LICENSE;
  const data = await loadDashboard(licenseNumber);

  if (!data) {
    return (
      <AppShell mode="RMO" name={session.name}>
        <p>License not found.</p>
      </AppShell>
    );
  }

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
          <p className="mt-2 text-3xl font-semibold tabular-nums">{data.logs.length}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Flagged reports</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-amber-800">{flagged}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Critical flags</p>
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
