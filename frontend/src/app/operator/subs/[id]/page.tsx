import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import SubEditor from '@/components/SubEditor';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import {
  loadMemberships,
  membershipLicenseIds,
  resolveAccessibleLicense,
  sessionHasLicenseId
} from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

export default async function OperatorSubDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { license?: string };
}) {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'OPERATOR') redirect('/dashboard');

  const live = await refreshSessionMemberships(session);
  const supabase = getSupabaseAdmin();
  const { data: sub } = await supabase
    .from('subcontractors')
    .select(
      'id, license_id, company_name, contact_name, phone, email, trade, cslb_license_number, coi_expiration_date, notes'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!sub) {
    return (
      <AppShell mode="OPERATOR" name={session.name}>
        <p className="text-slate-600">Subcontractor not found.</p>
        <Link href="/operator/subs" className="mt-4 inline-block text-sm text-teal-800 hover:underline">
          ← Back to Subs
        </Link>
      </AppShell>
    );
  }

  if (!sessionHasLicenseId(live, sub.license_id)) {
    const memberships = await loadMemberships(live.userId);
    if (!membershipLicenseIds(memberships).includes(sub.license_id)) {
      redirect('/operator/subs');
    }
  }

  const resolved = await resolveAccessibleLicense(live, searchParams.license);
  const current =
    resolved?.license.license_number ||
    (
      await supabase
        .from('licenses')
        .select('license_number')
        .eq('id', sub.license_id)
        .maybeSingle()
    ).data?.license_number ||
    '';
  const coiUrl = typeof sub.notes === 'string' && sub.notes.startsWith('http') ? sub.notes : '';

  return (
    <AppShell mode="OPERATOR" name={session.name}>
      <p className="text-sm uppercase tracking-wide text-slate-500">Sub</p>
      <h1 className="mb-6 font-serif text-4xl">{sub.company_name || 'Subcontractor'}</h1>
      <SubEditor
        mode="OPERATOR"
        licenseNumber={current}
        cancelHref={`/operator/subs?license=${encodeURIComponent(current)}`}
        initial={{
          id: sub.id,
          company_name: sub.company_name || '',
          contact_name: sub.contact_name || '',
          phone: sub.phone || '',
          email: sub.email || '',
          trade: sub.trade || '',
          cslb_license_number: sub.cslb_license_number || '',
          coi_expiration_date: sub.coi_expiration_date || '',
          coi_document_url: coiUrl
        }}
      />
    </AppShell>
  );
}
