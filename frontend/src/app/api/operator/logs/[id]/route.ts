import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { assertLogAccess } from '@/lib/access';

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

  const body = await req.json().catch(() => ({}));
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
      { error: 'Backend rejected update', details: parsed },
      { status: res.status }
    );
  }

  return NextResponse.json(parsed);
}
