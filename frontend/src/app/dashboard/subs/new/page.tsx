import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import SubEditor from '@/components/SubEditor';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense } from '@/lib/access';

export default async function DashboardNewSubPage({
  searchParams
}: {
  searchParams: { license?: string };
}) {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');

  const live = await refreshSessionMemberships(session);
  const resolved = await resolveAccessibleLicense(live, searchParams.license);
  if (!resolved) redirect('/dashboard/subs');

  const current = resolved.license.license_number;
  return (
    <AppShell mode="RMO" name={session.name}>
      <p className="text-sm uppercase tracking-wide text-slate-500">Subs</p>
      <h1 className="font-serif text-4xl">Add sub</h1>
      <p className="mt-1 mb-6 text-slate-600">{resolved.license.entity_name}</p>
      <SubEditor
        mode="RMO"
        licenseNumber={current}
        cancelHref={`/dashboard/subs?license=${encodeURIComponent(current)}`}
      />
    </AppShell>
  );
}
