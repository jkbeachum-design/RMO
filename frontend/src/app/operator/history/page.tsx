import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import OperatorHistoryClient from '@/components/OperatorHistoryClient';
import { getSession } from '@/lib/auth';
import { DEFAULT_LICENSE } from '@/lib/constants';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ComplianceLog } from '@/lib/types';

export default async function OperatorHistoryPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'OPERATOR') redirect('/dashboard');

  const supabase = getSupabaseAdmin();
  const { data: license } = await supabase
    .from('licenses')
    .select('id')
    .eq('license_number', DEFAULT_LICENSE)
    .single();

  let logs: ComplianceLog[] = [];
  if (license) {
    const { data } = await supabase
      .from('compliance_logs')
      .select('*')
      .eq('license_id', license.id)
      .order('created_at', { ascending: false })
      .limit(30);
    logs = (data || []) as ComplianceLog[];
  }

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || 'https://temporary-speedy-ochre-5dx4e3g.vercel.app';

  return (
    <AppShell mode="OPERATOR" name={session.name}>
      <OperatorHistoryClient initialLogs={logs} backendUrl={backendUrl} />
    </AppShell>
  );
}
