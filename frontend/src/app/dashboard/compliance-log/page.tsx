import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import AppShell from '@/components/AppShell';
import ComplianceLogTable from '@/components/ComplianceLogTable';
import LicenseSwitcher from '@/components/LicenseSwitcher';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds, resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ComplianceLog, License } from '@/lib/types';

export default async function ComplianceLogPage({
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
  const resolved = await resolveAccessibleLicense(live, searchParams.license);

  if (!resolved) {
    return (
      <AppShell mode="RMO" name={session.name}>
        <p>No accessible licenses.</p>
      </AppShell>
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: licenses } = await supabase
    .from('licenses')
    .select('license_number, entity_name')
    .in('id', allowedIds)
    .order('license_number');

  const licenseNumber = resolved.license.license_number;

  const { data: logs } = await supabase
    .from('compliance_logs')
    .select('*')
    .eq('license_id', resolved.license.id)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <AppShell mode="RMO" name={session.name}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-4xl">Compliance Log</h1>
          <p className="mt-1 text-slate-600">
            {resolved.license.entity_name} · full audit trail
          </p>
        </div>
        <Suspense fallback={null}>
          <LicenseSwitcher
            licenses={(licenses || []) as License[]}
            current={licenseNumber}
          />
        </Suspense>
      </div>
      <ComplianceLogTable logs={(logs || []) as ComplianceLog[]} />
    </AppShell>
  );
}
