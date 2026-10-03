import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import ProjectEditor from '@/components/ProjectEditor';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import {
  loadMemberships,
  membershipLicenseIds,
  resolveAccessibleLicense,
  sessionHasLicenseId
} from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

export default async function DashboardProjectDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { license?: string };
}) {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');

  const live = await refreshSessionMemberships(session);
  const supabase = getSupabaseAdmin();
  const { data: project } = await supabase
    .from('projects')
    .select(
      'id, license_id, project_address, contract_value, permit_number, trades_involved, start_date, end_date, status, scope_description'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!project) {
    return (
      <AppShell mode="RMO" name={session.name}>
        <p>Project not found.</p>
        <Link href="/dashboard/projects" className="mt-4 inline-block text-sm text-teal-800 hover:underline">
          ← Back to projects
        </Link>
      </AppShell>
    );
  }

  if (!sessionHasLicenseId(live, project.license_id)) {
    const memberships = await loadMemberships(live.userId);
    if (!membershipLicenseIds(memberships).includes(project.license_id)) {
      redirect('/dashboard/projects');
    }
  }

  const resolved = await resolveAccessibleLicense(live, searchParams.license);
  const current =
    resolved?.license.license_number ||
    (
      await supabase
        .from('licenses')
        .select('license_number')
        .eq('id', project.license_id)
        .maybeSingle()
    ).data?.license_number ||
    '';

  return (
    <AppShell mode="RMO" name={session.name}>
      <p className="text-sm uppercase tracking-wide text-slate-500">Project</p>
      <h1 className="mb-6 font-serif text-4xl">{project.project_address || 'Project'}</h1>
      <ProjectEditor
        mode="RMO"
        licenseNumber={current}
        cancelHref={`/dashboard/projects?license=${encodeURIComponent(current)}`}
        initial={{
          id: project.id,
          project_address: project.project_address || '',
          contract_value:
            project.contract_value != null ? String(project.contract_value) : '',
          permit_number: project.permit_number || '',
          trades: (project.trades_involved || []).join(', '),
          scope_description: project.scope_description || '',
          start_date: project.start_date || '',
          end_date: project.end_date || '',
          status: project.status || 'ACTIVE'
        }}
      />
    </AppShell>
  );
}
