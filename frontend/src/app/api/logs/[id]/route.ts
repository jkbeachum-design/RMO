import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: log, error } = await supabase
    .from('compliance_logs')
    .select('*, licenses(*)')
    .eq('id', params.id)
    .single();

  if (error || !log) {
    return NextResponse.json({ error: 'Log not found' }, { status: 404 });
  }

  return NextResponse.json({ log });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = getSession();
  if (!session || session.mode !== 'RMO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (typeof body.rmo_notes === 'string') updates.rmo_notes = body.rmo_notes;
  if (body.rmo_reviewed === true) {
    updates.rmo_reviewed = true;
    updates.rmo_reviewed_at = new Date().toISOString();
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('compliance_logs')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ log: data });
}
