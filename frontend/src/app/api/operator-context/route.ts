import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

/** Membership-scoped projects + subcontractors for the structured PWA form. */
export async function GET(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const { searchParams } = new URL(req.url);
  const licenseNumber = searchParams.get('license_number');

  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const [{ data: projects }, { data: subcontractors }] = await Promise.all([
    supabase
      .from('projects')
      .select(
        'id, project_address, contract_value, permit_number, trades_involved, start_date, end_date, status'
      )
      .eq('license_id', resolved.license.id)
      .eq('status', 'ACTIVE')
      .order('updated_at', { ascending: false }),
    supabase
      .from('subcontractors')
      .select(
        'id, company_name, cslb_license_number, trade, coi_expiration_date, coi_verified, notes'
      )
      .eq('license_id', resolved.license.id)
      .order('company_name', { ascending: true })
  ]);

  const enrichedSubs = (subcontractors || []).map((s) => ({
    ...s,
    coi_document_url:
      typeof s.notes === 'string' && s.notes.startsWith('http') ? s.notes : null
  }));

  return NextResponse.json({
    license: {
      id: resolved.license.id,
      license_number: resolved.license.license_number,
      entity_name: resolved.license.entity_name
    },
    projects: projects || [],
    subcontractors: enrichedSubs
  });
}
