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
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  // Operators only see logs for licenses they belong to (already enforced).
  // RMOs see all logs for the selected company; operators get the same scoped list for history.
  const supabase = getSupabaseAdmin();
  const { data: logs, error } = await supabase
    .from('compliance_logs')
    .select('*')
    .eq('license_id', resolved.license.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    logs: logs || [],
    license: {
      id: resolved.license.id,
      license_number: resolved.license.license_number,
      entity_name: resolved.license.entity_name
    }
  });
}
