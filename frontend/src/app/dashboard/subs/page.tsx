import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { format } from 'date-fns';
import AppShell from '@/components/AppShell';
import LicenseSwitcher from '@/components/LicenseSwitcher';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds, resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { License } from '@/lib/types';

type SubRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  trade: string | null;
  cslb_license_number: string | null;
  coi_expiration_date: string | null;
  coi_verified: boolean | null;
  notes: string | null;
  updated_at: string | null;
};

export default async function DashboardSubsPage({
  searchParams
}: {
  searchParams: { license?: string };
}) {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');

  const live = await refreshSessionMemberships(session);
  const memberships = await loadMemberships(live.userId);
  const allowedIds = membershipLicenseIds(memberships);

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

  const { data: subcontractors } = await supabase
    .from('subcontractors')
    .select(
      'id, company_name, contact_name, phone, email, trade, cslb_license_number, coi_expiration_date, coi_verified, notes, updated_at'
    )
    .eq('license_id', resolved.license.id)
    .order('company_name', { ascending: true })
    .limit(200);

  const list = (subcontractors || []) as SubRow[];
  const current = resolved.license.license_number;

  return (
    <AppShell mode="RMO" name={session.name}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Ops</p>
          <h1 className="font-serif text-4xl">Subs</h1>
          <p className="mt-1 text-slate-600">
            {resolved.license.entity_name} · {resolved.license.classification}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Suspense fallback={null}>
            <LicenseSwitcher licenses={(licenses || []) as License[]} current={current} />
          </Suspense>
          <Link
            href={`/dashboard/subs/new?license=${encodeURIComponent(current)}`}
            className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163838]"
          >
            Add sub
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Trade</th>
              <th className="px-4 py-3">COI expiry</th>
              <th className="px-4 py-3">CSLB #</th>
              <th className="px-4 py-3">Document</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const coiUrl =
                typeof s.notes === 'string' && s.notes.startsWith('http') ? s.notes : null;
              return (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/subs/${s.id}?license=${encodeURIComponent(current)}`}
                      className="font-medium text-teal-900 hover:underline"
                    >
                      {s.company_name || '—'}
                    </Link>
                    {s.updated_at ? (
                      <span className="mt-0.5 block text-xs text-slate-400">
                        upd {format(new Date(s.updated_at), 'PP')}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <span className="block">{s.contact_name || '—'}</span>
                    <span className="block text-xs text-slate-500">
                      {[s.phone, s.email].filter(Boolean).join(' · ') || ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{s.trade || '—'}</td>
                  <td className="px-4 py-3">
                    {s.coi_expiration_date || '—'}
                    {s.coi_verified ? (
                      <span className="mt-0.5 block text-xs text-teal-800">Verified</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{s.cslb_license_number || '—'}</td>
                  <td className="px-4 py-3">
                    {coiUrl ? (
                      <a
                        href={coiUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-teal-800 hover:underline"
                      >
                        Open COI
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!list.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No subcontractors for this company yet. Add one here or from a CEO report.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
