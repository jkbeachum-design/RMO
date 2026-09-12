import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import AppShell from '@/components/AppShell';
import LicenseSwitcher from '@/components/LicenseSwitcher';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds, resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { License } from '@/lib/types';

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

type VaultItem = {
  kind: string;
  title: string;
  entity: string;
  license_number: string;
  expires_on: string | null;
  days_remaining: number | null;
  status: 'ok' | 'expiring' | 'expired' | 'missing';
  href?: string | null;
};

export default async function VaultPage({
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
        .select(
          'id, license_number, entity_name, license_expire_date, workers_comp_status'
        )
        .in('id', allowedIds)
        .order('license_number')
    : { data: [] };

  let licenseIds = allowedIds;
  let current = searchParams.license || licenses?.[0]?.license_number || '';
  if (searchParams.license) {
    const resolved = await resolveAccessibleLicense(live, searchParams.license);
    if (resolved) {
      licenseIds = [resolved.license.id];
      current = resolved.license.license_number;
    }
  }

  const { data: subcontractors } = licenseIds.length
    ? await supabase
        .from('subcontractors')
        .select(
          'id, license_id, company_name, trade, coi_expiration_date, notes, cslb_license_number'
        )
        .in('license_id', licenseIds)
    : { data: [] };

  const licenseById = new Map((licenses || []).map((l) => [l.id, l]));
  const items: VaultItem[] = [];

  for (const lic of (licenses || []).filter((l) => licenseIds.includes(l.id))) {
    const days = daysUntil(lic.license_expire_date);
    items.push({
      kind: 'LICENSE',
      title: 'CSLB license renewal',
      entity: lic.entity_name,
      license_number: lic.license_number,
      expires_on: lic.license_expire_date || null,
      days_remaining: days,
      status:
        days == null ? 'missing' : days < 0 ? 'expired' : days <= 60 ? 'expiring' : 'ok'
    });
  }

  for (const sub of subcontractors || []) {
    const lic = licenseById.get(sub.license_id);
    const url =
      typeof sub.notes === 'string' && sub.notes.startsWith('http') ? sub.notes : null;
    const days = daysUntil(sub.coi_expiration_date);
    let status: VaultItem['status'] = 'ok';
    if (!sub.coi_expiration_date && !url) status = 'missing';
    else if (days != null && days < 0) status = 'expired';
    else if (days != null && days <= 30) status = 'expiring';
    else if (!url) status = 'missing';
    items.push({
      kind: 'COI',
      title: `COI — ${sub.company_name}`,
      entity: lic?.entity_name || 'Company',
      license_number: lic?.license_number || '',
      expires_on: sub.coi_expiration_date || null,
      days_remaining: days,
      status,
      href: url
    });
  }

  const rank = { expired: 0, missing: 1, expiring: 2, ok: 3 } as const;
  items.sort((a, b) => rank[a.status] - rank[b.status]);

  const summary = {
    expired: items.filter((i) => i.status === 'expired').length,
    expiring: items.filter((i) => i.status === 'expiring').length,
    missing: items.filter((i) => i.status === 'missing').length
  };

  const statusClass: Record<VaultItem['status'], string> = {
    ok: 'border-slate-200 bg-white',
    expiring: 'border-amber-300 bg-amber-50',
    expired: 'border-red-300 bg-red-50',
    missing: 'border-slate-300 bg-slate-50'
  };

  return (
    <AppShell mode="RMO" name={session.name}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Hygiene</p>
          <h1 className="font-serif text-4xl">Document vault</h1>
          <p className="mt-1 text-slate-600">
            License renewals and subcontractor COI expiries for companies you qualify.
          </p>
        </div>
        <Suspense fallback={null}>
          <LicenseSwitcher licenses={(licenses || []) as License[]} current={current} />
        </Suspense>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="border border-red-200 bg-red-50 p-4">
          <p className="text-xs uppercase text-red-800">Expired</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.expired}</p>
        </div>
        <div className="border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs uppercase text-amber-800">Expiring soon</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.expiring}</p>
        </div>
        <div className="border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Missing docs</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.missing}</p>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={`${item.kind}-${item.title}-${i}`} className={`border p-4 ${statusClass[item.status]}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {item.kind} · {item.entity}
                  {item.license_number ? ` #${item.license_number}` : ''}
                </p>
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-slate-600">
                  {item.expires_on
                    ? `Expires ${item.expires_on}${
                        item.days_remaining != null
                          ? ` · ${item.days_remaining} day${item.days_remaining === 1 ? '' : 's'}`
                          : ''
                      }`
                    : 'No expiry on file'}
                  {item.status !== 'ok' ? ` · ${item.status}` : ''}
                </p>
              </div>
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-teal-800 hover:underline"
                >
                  Open document
                </a>
              ) : null}
            </div>
          </div>
        ))}
        {!items.length ? (
          <p className="text-slate-500">No documents yet for this company.</p>
        ) : null}
      </div>
    </AppShell>
  );
}
