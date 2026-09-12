import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import OperatorHistoryClient from '@/components/OperatorHistoryClient';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ComplianceLog } from '@/lib/types';

export default async function OperatorHistoryPage({
  searchParams
}: {
  searchParams: { license?: string };
}) {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'OPERATOR') redirect('/dashboard');

  const live = await refreshSessionMemberships(session);
  const resolved = await resolveAccessibleLicense(live, searchParams.license);

  let logs: ComplianceLog[] = [];
  let entityName = 'your companies';

  if (resolved) {
    entityName = resolved.license.entity_name;
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('compliance_logs')
      .select('*')
      .eq('license_id', resolved.license.id)
      .order('created_at', { ascending: false })
      .limit(30);
    logs = (data || []) as ComplianceLog[];
  }

  return (
    <AppShell mode="OPERATOR" name={session.name}>
      <OperatorHistoryClient initialLogs={logs} entityName={entityName} />
    </AppShell>
  );
}
