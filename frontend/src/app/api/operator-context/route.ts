import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { DEFAULT_LICENSE } from '@/lib/constants';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const licenseNumber = searchParams.get('license_number') || DEFAULT_LICENSE;

  const supabase = getSupabaseAdmin();
  const { data: license, error: licenseError } = await supabase
    .from('licenses')
    .select('id, license_number, entity_name')
    .eq('license_number', licenseNumber)
    .single();

  if (licenseError || !license) {
    return NextResponse.json({ error: 'License not found' }, { status: 404 });
  }

  const [{ data: projects }, { data: subcontractors }] = await Promise.all([
    supabase
      .from('projects')
      .select(
        'id, project_address, contract_value, permit_number, trades_involved, start_date, end_date, status'
      )
      .eq('license_id', license.id)
      .eq('status', 'ACTIVE')
      .order('updated_at', { ascending: false }),
    supabase
      .from('subcontractors')
      .select('id, company_name, cslb_license_number, trade, coi_expiration_date, coi_verified, notes')
      .eq('license_id', license.id)
      .order('company_name', { ascending: true })
  ]);

  const enrichedSubs = (subcontractors || []).map((s) => ({
    ...s,
    coi_document_url:
      typeof s.notes === 'string' && s.notes.startsWith('http') ? s.notes : null
  }));

  return NextResponse.json({
    license,
    projects: projects || [],
    subcontractors: enrichedSubs
  });
}
