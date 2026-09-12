import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const { searchParams } = new URL(req.url);
  const licenseNumber = searchParams.get('license_number');
  const status = searchParams.get('status'); // ACTIVE | COMPLETED | all

  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('projects')
    .select(
      'id, project_address, contract_value, permit_number, trades_involved, start_date, end_date, status, scope_description, updated_at, created_at'
    )
    .eq('license_id', resolved.license.id)
    .order('updated_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data: projects, error } = await query.limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    license: {
      id: resolved.license.id,
      license_number: resolved.license.license_number,
      entity_name: resolved.license.entity_name,
      classification: resolved.license.classification
    },
    projects: projects || []
  });
}
