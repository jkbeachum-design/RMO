import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds, resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

/** Unreviewed / critical compliance logs for the RMO inbox. */
export async function GET(req: Request) {
  const session = getSession();
  if (!session || session.mode !== 'RMO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const { searchParams } = new URL(req.url);
  const licenseNumber = searchParams.get('license_number');
  const filter = searchParams.get('filter') || 'needs_review'; // needs_review | critical | all_open

  const memberships = await loadMemberships(live.userId);
  const allowedIds = membershipLicenseIds(memberships);
  if (!allowedIds.length) {
    return NextResponse.json({ logs: [], counts: { needs_review: 0, critical: 0 } });
  }

  let licenseIds = allowedIds;
  if (licenseNumber) {
    const resolved = await resolveAccessibleLicense(live, licenseNumber);
    if (!resolved) {
      return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
    }
    licenseIds = [resolved.license.id];
  }

  const supabase = getSupabaseAdmin();
  const { data: logs, error } = await supabase
    .from('compliance_logs')
    .select('*, licenses(license_number, entity_name)')
    .in('license_id', licenseIds)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = logs || [];
  const needsReview = list.filter((l) => !l.rmo_reviewed);
  const critical = needsReview.filter(
    (l) => (l.risk_flags?.critical_flags || []).length > 0
  );
  const flagged = needsReview.filter((l) => l.risk_flags?.flagged);

  let filtered = needsReview;
  if (filter === 'critical') filtered = critical;
  else if (filter === 'flagged') filtered = flagged;
  else if (filter === 'all_open') filtered = needsReview;

  return NextResponse.json({
    logs: filtered,
    counts: {
      needs_review: needsReview.length,
      critical: critical.length,
      flagged: flagged.length
    }
  });
}
