import { redirect } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import AppShell from '@/components/AppShell';
import { RiskFlagList } from '@/components/RiskFlagBadge';
import ReviewActions from '@/components/ReviewActions';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { assertLogAccess } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ComplianceLog, ExtractedData, License } from '@/lib/types';

export default async function LogDetailPage({
  params
}: {
  params: { logId: string };
}) {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');

  const live = await refreshSessionMemberships(session);
  const allowed = await assertLogAccess(live, params.logId);
  if (!allowed) {
    return (
      <AppShell mode="RMO" name={session.name}>
        <p>Log not found or access denied.</p>
        <Link href="/dashboard" className="text-teal-800 underline">
          Back to dashboard
        </Link>
      </AppShell>
    );
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('compliance_logs')
    .select('*, licenses(*)')
    .eq('id', params.logId)
    .single();

  if (!data) {
    return (
      <AppShell mode="RMO" name={session.name}>
        <p>Log not found.</p>
        <Link href="/dashboard" className="text-teal-800 underline">
          Back to dashboard
        </Link>
      </AppShell>
    );
  }

  const log = data as ComplianceLog & { licenses: License };
  const extracted = (log.extracted_data || {}) as ExtractedData;
  const when = log.call_timestamp || log.created_at;

  return (
    <AppShell mode="RMO" name={session.name}>
      <Link href="/dashboard" className="text-sm text-teal-800 hover:underline">
        ← Back to dashboard
      </Link>

      <div className="mt-4 mb-8">
        <p className="text-sm uppercase tracking-wide text-slate-500">Compliance log detail</p>
        <h1 className="font-serif text-4xl">
          {extracted.projects?.[0]?.address || 'Field report'}
        </h1>
        <p className="mt-1 text-slate-600">
          {format(new Date(when), 'PPpp')} · {log.source_type}
          {log.source_channel ? ` / ${log.source_channel}` : ''}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-2">
          <div className="border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Extracted data</h2>
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-slate-500">Operator</dt>
                <dd className="font-medium">{extracted.operator_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">License</dt>
                <dd className="font-medium">#{extracted.license_number || log.licenses?.license_number}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Contract value</dt>
                <dd className="font-medium">
                  {extracted.projects?.[0]?.contract_value != null
                    ? `$${Number(extracted.projects[0].contract_value).toLocaleString()}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Crew</dt>
                <dd className="font-medium">
                  {extracted.crew_status?.has_direct_employees
                    ? `Direct employees (${extracted.crew_status.employee_count ?? '?'})`
                    : 'No direct employees'}
                </dd>
              </div>
            </dl>

            {extracted.projects?.length ? (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Projects
                </h3>
                <ul className="space-y-2 text-sm">
                  {extracted.projects.map((p, i) => (
                    <li key={i} className="border-l-2 border-teal-700 pl-3">
                      <p className="font-medium">{p.address || 'Address not provided'}</p>
                      <p className="text-slate-600">
                        {(p.trades || []).join(', ') || 'No trades listed'}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {extracted.subcontractors?.length ? (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Subcontractors
                </h3>
                <ul className="space-y-2 text-sm">
                  {extracted.subcontractors.map((s, i) => {
                    const today = new Date().toISOString().split('T')[0];
                    const coiOk = Boolean(
                      s.coi_document_url &&
                        s.coi_expiration_date &&
                        s.coi_expiration_date >= today
                    );
                    return (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: coiOk ? '#059669' : '#b91c1c' }}
                          title={coiOk ? 'COI current' : 'COI missing or expired'}
                          aria-label={coiOk ? 'COI current' : 'COI missing or expired'}
                        />
                        <span>
                          {s.company_name} · {s.trade || 'trade n/a'} ·{' '}
                          {s.cslb_license_number || 'no CSLB #'}
                          {s.coi_expiration_date ? ` · COI ${s.coi_expiration_date}` : ''}
                        </span>
                        {s.coi_document_url ? (
                          <a
                            href={s.coi_document_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-teal-800 hover:underline"
                          >
                            view COI
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {extracted.file_urls &&
            (extracted.file_urls.cois?.length ||
              extracted.file_urls.permits?.length ||
              extracted.file_urls.photos?.length) ? (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Uploaded documents
                </h3>
                <ul className="space-y-1 text-sm">
                  {(extracted.file_urls.cois || []).map((item, i) => {
                    const url = typeof item === 'string' ? item : item.url;
                    const label =
                      typeof item === 'string'
                        ? `COI ${i + 1}`
                        : `COI${item.company_name ? ` · ${item.company_name}` : ` ${i + 1}`}`;
                    return (
                      <li key={`coi-${i}`}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal-800 hover:underline"
                        >
                          {label}
                        </a>
                      </li>
                    );
                  })}
                  {(extracted.file_urls.permits || []).map((url, i) => (
                    <li key={`permit-${i}`}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-800 hover:underline"
                      >
                        Permit {i + 1}
                      </a>
                    </li>
                  ))}
                  {(extracted.file_urls.photos || []).map((url, i) => (
                    <li key={`photo-${i}`}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-800 hover:underline"
                      >
                        Photo {i + 1}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">
              {log.source_type === 'PWA_FORM' ? 'Operator notes' : 'Raw transcript'}
            </h2>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700">
              {log.raw_payload || 'No transcript stored.'}
            </pre>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Risk flags</h2>
            <RiskFlagList riskFlags={log.risk_flags} />
            {log.risk_flags?.raw_flags?.length ? (
              <ul className="mt-4 space-y-3 text-sm">
                {log.risk_flags.raw_flags.map((f, i) => (
                  <li key={i} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                    <p className="font-medium">{f.flag}</p>
                    <p className="text-slate-600">{f.reason}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <ReviewActions
            logId={log.id}
            initialNotes={log.rmo_notes || ''}
            reviewed={Boolean(log.rmo_reviewed)}
          />
        </aside>
      </div>
    </AppShell>
  );
}
