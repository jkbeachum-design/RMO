import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds, resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

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

  const memberships = await loadMemberships(live.userId);
  const allowedIds = membershipLicenseIds(memberships);
  const supabase = getSupabaseAdmin();

  const { data: licenses } = await supabase
    .from('licenses')
    .select(
      'id, license_number, entity_name, workers_comp_status, license_expire_date, classification'
    )
    .in('id', allowedIds)
    .order('license_number');

  const { count: projectCount } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('license_id', resolved.license.id)
    .eq('status', 'ACTIVE');

  return NextResponse.json({
    license: resolved.license,
    licenses: licenses || [],
    activeProjects: projectCount || 0
  });
}
