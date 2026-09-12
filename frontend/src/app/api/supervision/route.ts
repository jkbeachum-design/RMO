import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

const ACTIVITY_TYPES = [
  'SUPERVISE_OPS',
  'TECH_ADMIN_DECISION',
  'WORKMANSHIP_QC',
  'ONSITE_VISIT',
  'MONITOR_DELEGATED',
  'OTHER'
] as const;

export async function GET(req: Request) {
  const session = getSession();
  if (!session || session.mode !== 'RMO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const { searchParams } = new URL(req.url);
  const resolved = await resolveAccessibleLicense(live, searchParams.get('license_number'));
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('supervision_activities')
    .select('*')
    .eq('license_id', resolved.license.id)
    .order('occurred_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: 'Apply supabase/migrations/003_supervision_activities.sql if table is missing'
      },
      { status: 500 }
    );
  }

  // Simple involvement heatmap: counts by day for last 30 days
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const heatmap: Record<string, number> = {};
  for (const row of data || []) {
    const d = new Date(row.occurred_at);
    if (d < since) continue;
    const key = d.toISOString().slice(0, 10);
    heatmap[key] = (heatmap[key] || 0) + 1;
  }

  return NextResponse.json({
    license: {
      id: resolved.license.id,
      license_number: resolved.license.license_number,
      entity_name: resolved.license.entity_name
    },
    activities: data || [],
    heatmap
  });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session || session.mode !== 'RMO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const body = await req.json().catch(() => ({}));
  const resolved = await resolveAccessibleLicense(live, body.license_number);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const activityType = String(body.activity_type || '');
  if (!ACTIVITY_TYPES.includes(activityType as (typeof ACTIVITY_TYPES)[number])) {
    return NextResponse.json({ error: 'Invalid activity_type' }, { status: 400 });
  }

  const summary = String(body.summary || '').trim();
  if (!summary) {
    return NextResponse.json({ error: 'summary required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('supervision_activities')
    .insert([
      {
        license_id: resolved.license.id,
        created_by: live.userId,
        activity_type: activityType,
        occurred_at: body.occurred_at || new Date().toISOString(),
        summary,
        details: body.details || null,
        project_address: body.project_address || null,
        project_id: body.project_id || null
      }
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ activity: data });
}
