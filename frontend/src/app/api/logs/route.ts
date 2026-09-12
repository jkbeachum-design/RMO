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
  const limit = Number(searchParams.get('limit') || 50);

  const supabase = getSupabaseAdmin();
  const { data: license } = await supabase
    .from('licenses')
    .select('id')
    .eq('license_number', licenseNumber)
    .single();

  if (!license) {
    return NextResponse.json({ error: 'License not found' }, { status: 404 });
  }

  const { data: logs, error } = await supabase
    .from('compliance_logs')
    .select('*')
    .eq('license_id', license.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: logs || [] });
}
