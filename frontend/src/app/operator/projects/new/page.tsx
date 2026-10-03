import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import ProjectEditor from '@/components/ProjectEditor';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense } from '@/lib/access';

export default async function OperatorNewProjectPage({
  searchParams
}: {
  searchParams: { license?: string };
}) {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'OPERATOR') redirect('/dashboard');

  const live = await refreshSessionMemberships(session);
  const resolved = await resolveAccessibleLicense(live, searchParams.license);
  if (!resolved) redirect('/operator/projects');

  const current = resolved.license.license_number;
  return (
    <AppShell mode="OPERATOR" name={session.name}>
      <p className="text-sm uppercase tracking-wide text-slate-500">Projects</p>
      <h1 className="font-serif text-4xl">Add project</h1>
      <p className="mt-1 mb-6 text-slate-600">{resolved.license.entity_name}</p>
      <ProjectEditor
        mode="OPERATOR"
        licenseNumber={current}
        cancelHref={`/operator/projects?license=${encodeURIComponent(current)}`}
      />
    </AppShell>
  );
}
