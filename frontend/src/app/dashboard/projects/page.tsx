import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { format } from 'date-fns';
import AppShell from '@/components/AppShell';
import LicenseSwitcher from '@/components/LicenseSwitcher';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds, resolveAccessibleLicense } from '@/lib/access';
import { projectStatusClass, projectStatusLabel } from '@/lib/projectStatus';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { License } from '@/lib/types';

type ProjectRow = {
  id: string;
  project_address: string;
  contract_value: number | null;
  permit_number: string | null;
  trades_involved: string[] | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  updated_at: string | null;
};

export default async function ProjectsPage({
  searchParams
}: {
  searchParams: { license?: string; status?: string };
}) {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');

  const live = await refreshSessionMemberships(session);
  const memberships = await loadMemberships(live.userId);
  const allowedIds = membershipLicenseIds(memberships);
  const statusFilter = searchParams.status || 'ACTIVE';

  const supabase = getSupabaseAdmin();
  const { data: licenses } = allowedIds.length
    ? await supabase
        .from('licenses')
        .select('license_number, entity_name, classification')
        .in('id', allowedIds)
        .order('license_number')
    : { data: [] };

  const resolved = await resolveAccessibleLicense(live, searchParams.license);
  if (!resolved) {
    return (
      <AppShell mode="RMO" name={session.name}>
        <p>No accessible licenses.</p>
      </AppShell>
    );
  }

  let query = supabase
    .from('projects')
    .select(
      'id, project_address, contract_value, permit_number, trades_involved, start_date, end_date, status, updated_at'
    )
    .eq('license_id', resolved.license.id)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data: projects } = await query;
  const list = (projects || []) as ProjectRow[];
  const current = resolved.license.license_number;

  const statusLink = (s: string) =>
    `/dashboard/projects?license=${encodeURIComponent(current)}&status=${s}`;

  return (
    <AppShell mode="RMO" name={session.name}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Ops</p>
          <h1 className="font-serif text-4xl">Projects</h1>
          <p className="mt-1 text-slate-600">
            {resolved.license.entity_name} · {resolved.license.classification}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Suspense fallback={null}>
            <LicenseSwitcher licenses={(licenses || []) as License[]} current={current} />
          </Suspense>
          <Link
            href={`/dashboard/projects/new?license=${encodeURIComponent(current)}`}
            className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163838]"
          >
            Add project
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {['ACTIVE', 'ON_HOLD', 'COMPLETED', 'all'].map((s) => (
          <a
            key={s}
            href={statusLink(s)}
            className={`rounded px-3 py-1.5 ${
              statusFilter === s
                ? 'bg-[#0f2a2a] text-white'
                : 'border border-slate-300 bg-white text-slate-800'
            }`}
          >
            {s === 'all' ? 'All' : projectStatusLabel(s)}
          </a>
        ))}
      </div>

      {!list.length ? (
        <p className="border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-slate-500">
          No projects in this filter. Add one here or from a CEO report.
        </p>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {list.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/projects/${p.id}?license=${encodeURIComponent(current)}`}
                  className="block border border-slate-200 bg-white p-4 hover:border-teal-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-medium text-slate-900">{p.project_address || '—'}</p>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${projectStatusClass(p.status)}`}
                    >
                      {projectStatusLabel(p.status)}
                    </span>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm text-slate-600">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Value</dt>
                      <dd className="tabular-nums">
                        {p.contract_value != null
                          ? `$${Number(p.contract_value).toLocaleString()}`
                          : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Permit</dt>
                      <dd className="truncate text-right">{p.permit_number || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Trades</dt>
                      <dd className="truncate text-right">
                        {(p.trades_involved || []).join(', ') || '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Dates</dt>
                      <dd className="text-right">
                        {p.start_date || '—'}
                        {p.end_date ? ` → ${p.end_date}` : ''}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto border border-slate-200 bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Permit</th>
                  <th className="px-4 py-3">Trades</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        href={`/dashboard/projects/${p.id}?license=${encodeURIComponent(current)}`}
                        className="text-teal-900 hover:underline"
                      >
                        {p.project_address || '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {p.contract_value != null
                        ? `$${Number(p.contract_value).toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">{p.permit_number || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {(p.trades_involved || []).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.start_date || '—'}
                      {p.end_date ? ` → ${p.end_date}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${projectStatusClass(p.status)}`}
                      >
                        {projectStatusLabel(p.status)}
                      </span>
                      {p.updated_at ? (
                        <span className="mt-1 block text-xs text-slate-400">
                          upd {format(new Date(p.updated_at), 'PP')}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}
