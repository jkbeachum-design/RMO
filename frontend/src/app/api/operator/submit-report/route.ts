import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense } from '@/lib/access';

/**
 * Authenticated operator submit path.
 * Builds a Retell-shaped payload and forwards to the Express webhook with the shared secret
 * so the public webhook is never called from the browser without credentials.
 */
export async function POST(req: Request) {
  const session = getSession();
  if (!session || session.mode !== 'OPERATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const body = await req.json().catch(() => ({}));
  const licenseNumber = String(body.license_number || '').trim();

  const resolved = await resolveAccessibleLicense(live, licenseNumber);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const operatorName = String(body.operator_name || live.name || 'Operator');
  const address = String(body.address || '').trim();
  if (!address) {
    return NextResponse.json({ error: 'Project address required' }, { status: 400 });
  }

  const transcript = [
    `Operator ${operatorName} reporting for license ${resolved.license.license_number}.`,
    `Project at ${address}, contract value ${body.contract_value || 'unknown'}.`,
    `Trades: ${body.trades || 'none'}.`,
    `Subcontractors: ${body.subcontractors || 'none named'}.`,
    `Crew status: ${body.crew || 'not provided'}.`,
    `Permits: ${body.permits || 'none'}.`,
    body.notes ? `Notes: ${body.notes}` : ''
  ]
    .filter(Boolean)
    .join(' ');

  const backend = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) {
    return NextResponse.json({ error: 'BACKEND_URL not configured' }, { status: 503 });
  }

  const secret =
    process.env.RETELL_WEBHOOK_SECRET ||
    process.env.RETELL_API_KEY ||
    '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
    headers['x-retell-signature'] = secret;
  }

  const payload = {
    event: 'call_ended',
    call_id: `manual-${live.userId.slice(0, 8)}-${Date.now()}`,
    transcript,
    from_number: null,
    end_timestamp: Date.now()
  };

  const res = await fetch(`${backend.replace(/\/$/, '')}/api/webhooks/retell`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: 'Backend rejected report', details: text },
      { status: res.status }
    );
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  return NextResponse.json({ ok: true, result: parsed });
}
