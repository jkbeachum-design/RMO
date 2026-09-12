import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

/** Current user + accessible licenses (membership-scoped). */
export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const refreshed = await refreshSessionMemberships(session);
  const memberships = await loadMemberships(refreshed.userId);
  const ids = membershipLicenseIds(memberships);

  const supabase = getSupabaseAdmin();
  const { data: licenses } = ids.length
    ? await supabase
        .from('licenses')
        .select(
          'id, license_number, entity_name, workers_comp_status, license_expire_date, classification, rmo_name'
        )
        .in('id', ids)
        .order('license_number')
    : { data: [] };

  return NextResponse.json({
    user: refreshed,
    licenses: licenses || [],
    memberships: memberships.map((m) => ({
      license_id: m.license_id,
      role: m.role,
      license_number: m.licenses?.license_number,
      entity_name: m.licenses?.entity_name
    }))
  });
}
