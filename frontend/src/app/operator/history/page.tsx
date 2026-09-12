import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { RiskFlagList } from '@/components/RiskFlagBadge';
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

  return (
    <AppShell mode="OPERATOR" name={session.name}>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-4xl">Your reports</h1>
        <p className="mt-2 text-slate-600">Recent check-ins for Beachum Construction (pilot).</p>

        <div className="mt-8 space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">
                    {format(new Date(log.call_timestamp || log.created_at), 'PPp')}
                  </p>
                  <p className="font-medium">
                    {log.extracted_data?.projects?.[0]?.address || 'Report'}
                  </p>
                </div>
                <RiskFlagList riskFlags={log.risk_flags} />
              </div>
            </div>
          ))}
          {!logs.length ? (
            <p className="text-slate-500">No reports yet. Call the compliance line to file one.</p>
          ) : null}
        </div>

        <Link href="/operator" className="mt-6 inline-block text-sm text-teal-800 hover:underline">
          ← Back to check-in
        </Link>
      </div>
    </AppShell>
  );
}
