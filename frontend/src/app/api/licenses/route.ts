import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const licenseNumber = searchParams.get('license_number') || '836089';

  const supabase = getSupabaseAdmin();
  const { data: license, error } = await supabase
    .from('licenses')
    .select('*')
    .eq('license_number', licenseNumber)
    .single();

  if (error || !license) {
    return NextResponse.json({ error: 'License not found' }, { status: 404 });
  }

  const { data: licenses } = await supabase
    .from('licenses')
    .select('id, license_number, entity_name, workers_comp_status, license_expire_date, classification')
    .order('license_number');

  const { count: projectCount } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('license_id', license.id)
    .eq('status', 'ACTIVE');

  return NextResponse.json({
    license,
    licenses: licenses || [],
    activeProjects: projectCount || 0
  });
}
