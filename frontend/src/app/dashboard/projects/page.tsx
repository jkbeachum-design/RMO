import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { format } from 'date-fns';
import AppShell from '@/components/AppShell';
import LicenseSwitcher from '@/components/LicenseSwitcher';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds, resolveAccessibleLicense } from '@/lib/access';
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
          <h1 className="font-serif text-4xl">Project registry</h1>
          <p className="mt-1 text-slate-600">
            {resolved.license.entity_name} · {resolved.license.classification}
          </p>
        </div>
        <Suspense fallback={null}>
          <LicenseSwitcher licenses={(licenses || []) as License[]} current={current} />
        </Suspense>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {['ACTIVE', 'COMPLETED', 'all'].map((s) => (
          <a
            key={s}
            href={statusLink(s)}
            className={`rounded px-3 py-1.5 ${
              statusFilter === s
                ? 'bg-[#0f2a2a] text-white'
                : 'border border-slate-300 bg-white text-slate-800'
            }`}
          >
            {s === 'all' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </a>
        ))}
      </div>

      <div className="overflow-x-auto border border-slate-200 bg-white">
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
                  {p.project_address || '—'}
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
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      p.status === 'COMPLETED'
                        ? 'bg-slate-200 text-slate-800'
                        : 'bg-teal-100 text-teal-900'
                    }`}
                  >
                    {p.status || 'ACTIVE'}
                  </span>
                  {p.updated_at ? (
                    <span className="mt-1 block text-xs text-slate-400">
                      upd {format(new Date(p.updated_at), 'PP')}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
            {!list.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No projects in this filter. Structured operator reports will populate this
                  registry.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
