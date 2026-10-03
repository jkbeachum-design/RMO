import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { format } from 'date-fns';
import AppShell from '@/components/AppShell';
import LicenseSwitcher from '@/components/LicenseSwitcher';
import VaultUploadForm from '@/components/VaultUploadForm';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds, resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import { loadVaultDocuments } from '@/lib/vaultDocuments';
import type { License } from '@/lib/types';

export default async function OperatorVaultPage({
  searchParams
}: {
  searchParams: { license?: string };
}) {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'OPERATOR') redirect('/dashboard');

  const live = await refreshSessionMemberships(session);
  const memberships = await loadMemberships(live.userId);
  const allowedIds = membershipLicenseIds(memberships);

  const supabase = getSupabaseAdmin();
  const { data: licenses } = allowedIds.length
    ? await supabase
        .from('licenses')
        .select('license_number, entity_name, classification')
        .in('id', allowedIds)
        .order('license_number')
    : { data: [] };

  const resolved = await resolveAccessibleLicense(live, searchParams.license);
  if (!resolved) {
    return (
      <AppShell mode="OPERATOR" name={session.name}>
        <p className="text-slate-600">No accessible companies for this account.</p>
      </AppShell>
    );
  }

  const docs = await loadVaultDocuments(supabase, [resolved.license.id]);
  const current = resolved.license.license_number;

  return (
    <AppShell mode="OPERATOR" name={session.name}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Company</p>
          <h1 className="font-serif text-4xl">Vault</h1>
          <p className="mt-1 text-slate-600">
            {resolved.license.entity_name} · COIs, permits, photos, and uploads
          </p>
        </div>
        <Suspense fallback={null}>
          <LicenseSwitcher licenses={(licenses || []) as License[]} current={current} />
        </Suspense>
      </div>

      <VaultUploadForm licenseNumber={current} />

      <div className="space-y-2">
        {docs.map((doc) => (
          <div key={doc.id} className="border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {doc.doc_type} · {doc.source.replace('_', ' ')}
                  {doc.related_name ? ` · ${doc.related_name}` : ''}
                </p>
                <p className="font-medium text-slate-900">{doc.title}</p>
                <p className="text-sm text-slate-600">
                  {doc.expires_on ? `Expires ${doc.expires_on}` : 'No expiry on file'}
                  {doc.created_at
                    ? ` · ${format(new Date(doc.created_at), 'PP')}`
                    : ''}
                </p>
              </div>
              <a
                href={doc.file_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-teal-800 hover:underline"
              >
                Open document
              </a>
            </div>
          </div>
        ))}
        {!docs.length ? (
          <p className="text-slate-500">
            No documents yet. Upload one above, or they will appear from report COI/permit/photo
            uploads.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
