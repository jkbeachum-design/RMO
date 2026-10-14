import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { assertLogAccess } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import { redactBackendResponseForOperator } from '@/lib/operatorRedaction';

function backendHeaders(): Record<string, string> {
  const secret = process.env.RETELL_WEBHOOK_SECRET || process.env.RETELL_API_KEY || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
    headers['x-retell-signature'] = secret;
  }
  return headers;
}

/** Operator correction proxy — membership-checked, then trusted backend PATCH. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = getSession();
  if (!session || session.mode !== 'OPERATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const allowed = await assertLogAccess(live, params.id);
  if (!allowed) {
    return NextResponse.json({ error: 'Log not found or access denied' }, { status: 404 });
  }

  const backend = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) {
    return NextResponse.json({ error: 'BACKEND_URL not configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // The CEO never sees audit_summary (RMO-only), so carry the stored one forward
  // instead of letting the correction wipe it.
  if (body.extracted_data && typeof body.extracted_data === 'object') {
    const { data: existing } = await getSupabaseAdmin()
      .from('compliance_logs')
      .select('extracted_data')
      .eq('id', params.id)
      .single();
    const prevSummary = (existing?.extracted_data as Record<string, unknown> | null)?.audit_summary;
    const ed = { ...(body.extracted_data as Record<string, unknown>) };
    delete ed.audit_summary;
    if (prevSummary) ed.audit_summary = prevSummary;
    body.extracted_data = ed;
  }
  const res = await fetch(
    `${backend.replace(/\/$/, '')}/api/compliance-logs/${params.id}`,
    {
      method: 'PATCH',
      headers: backendHeaders(),
      body: JSON.stringify(body)
    }
  );

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep */
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: 'Backend rejected update', details: redactBackendResponseForOperator(parsed) },
      { status: res.status }
    );
  }

  return NextResponse.json(redactBackendResponseForOperator(parsed));
}
