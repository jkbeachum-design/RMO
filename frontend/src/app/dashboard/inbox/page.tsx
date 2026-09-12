import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { format } from 'date-fns';
import AppShell from '@/components/AppShell';
import LicenseSwitcher from '@/components/LicenseSwitcher';
import { RiskFlagList } from '@/components/RiskFlagBadge';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds, resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ComplianceLog, License } from '@/lib/types';

type InboxLog = ComplianceLog & {
  licenses?: { license_number: string; entity_name: string } | null;
};

export default async function InboxPage({
  searchParams
}: {
  searchParams: { license?: string; filter?: string };
}) {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');

  const live = await refreshSessionMemberships(session);
  const memberships = await loadMemberships(live.userId);
  const allowedIds = membershipLicenseIds(memberships);
  const filter = searchParams.filter || 'needs_review';

  const supabase = getSupabaseAdmin();
  const { data: licenses } = allowedIds.length
    ? await supabase
        .from('licenses')
        .select('license_number, entity_name')
        .in('id', allowedIds)
        .order('license_number')
    : { data: [] };

  let licenseIds = allowedIds;
  let currentLicense = searchParams.license || '';
  if (searchParams.license) {
    const resolved = await resolveAccessibleLicense(live, searchParams.license);
    if (resolved) {
      licenseIds = [resolved.license.id];
      currentLicense = resolved.license.license_number;
    }
  } else if (licenses?.[0]) {
    currentLicense = licenses[0].license_number;
  }

  let logs: InboxLog[] = [];
  if (licenseIds.length) {
    const { data } = await supabase
      .from('compliance_logs')
      .select('*, licenses(license_number, entity_name)')
      .in('license_id', licenseIds)
      .eq('rmo_reviewed', false)
      .order('created_at', { ascending: false })
      .limit(100);
    logs = (data || []) as InboxLog[];
  }

  const critical = logs.filter((l) => (l.risk_flags?.critical_flags || []).length > 0);
  const flagged = logs.filter((l) => l.risk_flags?.flagged);
  const shown =
    filter === 'critical' ? critical : filter === 'flagged' ? flagged : logs;

  const qs = (f: string) => {
    const p = new URLSearchParams();
    if (currentLicense) p.set('license', currentLicense);
    p.set('filter', f);
    return `/dashboard/inbox?${p.toString()}`;
  };

  return (
    <AppShell mode="RMO" name={session.name}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Needs review</p>
          <h1 className="font-serif text-4xl">Inbox</h1>
          <p className="mt-1 text-slate-600">
            Unreviewed operator reports across your companies. Critical items first.
          </p>
        </div>
        <Suspense fallback={null}>
          <LicenseSwitcher
            licenses={(licenses || []) as License[]}
            current={currentLicense}
          />
        </Suspense>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <Link
          href={qs('needs_review')}
          className={`rounded px-3 py-1.5 ${
            filter === 'needs_review'
              ? 'bg-[#0f2a2a] text-white'
              : 'border border-slate-300 bg-white text-slate-800'
          }`}
        >
          All open ({logs.length})
        </Link>
        <Link
          href={qs('critical')}
          className={`rounded px-3 py-1.5 ${
            filter === 'critical'
              ? 'bg-red-900 text-white'
              : 'border border-slate-300 bg-white text-slate-800'
          }`}
        >
          Critical ({critical.length})
        </Link>
        <Link
          href={qs('flagged')}
          className={`rounded px-3 py-1.5 ${
            filter === 'flagged'
              ? 'bg-amber-800 text-white'
              : 'border border-slate-300 bg-white text-slate-800'
          }`}
        >
          Flagged ({flagged.length})
        </Link>
      </div>

      <div className="space-y-3">
        {shown.map((log) => {
          const isCritical = (log.risk_flags?.critical_flags || []).length > 0;
          return (
            <Link
              key={log.id}
              href={`/dashboard/${log.id}`}
              className={`block border bg-white p-4 hover:border-teal-700 ${
                isCritical ? 'border-red-300' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {log.licenses?.entity_name || 'Company'} · #
                    {log.licenses?.license_number}
                    {isCritical ? ' · CRITICAL' : ''}
                  </p>
                  <p className="mt-1 font-medium text-slate-900">
                    {log.extracted_data?.projects?.[0]?.address ||
                      log.extracted_data?.operator_name ||
                      'Field report'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {format(new Date(log.call_timestamp || log.created_at), 'PPp')} ·{' '}
                    {log.source_type}
                  </p>
                </div>
                <RiskFlagList riskFlags={log.risk_flags} />
              </div>
            </Link>
          );
        })}
        {!shown.length ? (
          <p className="border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            Inbox clear — no unreviewed reports in this filter.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
