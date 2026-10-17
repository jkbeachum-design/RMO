import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { resolveAccessibleLicense } from '@/lib/access';
import { redactBackendResponseForOperator } from '@/lib/operatorRedaction';
import { notifyRmosOfReport } from '@/lib/rmoAlerts';

function backendHeaders(): Record<string, string> {
  const secret = process.env.RETELL_WEBHOOK_SECRET || process.env.RETELL_API_KEY || '';
  const headers: Record<string, string> = {};
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
    headers['x-retell-signature'] = secret;
  }
  return headers;
}

/**
 * Authenticated multipart proxy → Express POST /api/submit-report
 * Enforces operator session + license membership before forwarding.
 */
export async function POST(req: Request) {
  const session = getSession();
  if (!session || session.mode !== 'OPERATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const formData = await req.formData();
  const licenseId = String(formData.get('licenseId') || '').trim();

  const resolved = await resolveAccessibleLicense(live, licenseId);
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  // Force canonical license number from membership
  formData.set('licenseId', resolved.license.license_number);
  if (!formData.get('operatorName')) {
    formData.set('operatorName', live.name);
  }

  const backend = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) {
    return NextResponse.json({ error: 'BACKEND_URL not configured' }, { status: 503 });
  }

  const res = await fetch(`${backend.replace(/\/$/, '')}/api/submit-report`, {
    method: 'POST',
    headers: backendHeaders(),
    body: formData
  });

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep text */
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: 'Backend rejected report', details: redactBackendResponseForOperator(parsed) },
      { status: res.status }
    );
  }

  // RMO alerts (ntfy + email). Never blocks or fails the CEO's submission; capped at 6s.
  const logId =
    parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).logId : null;
  if (typeof logId === 'string' && logId) {
    await Promise.race([
      notifyRmosOfReport(logId).catch(() => []),
      new Promise((r) => setTimeout(r, 6000))
    ]);
  }

  // Activity: report_submitted (best-effort; never fails the CEO response)
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase');
    const { shortUserAgent } = await import('@/lib/activity');
    const supabase = getSupabaseAdmin();
    await supabase.from('activity_events').insert([
      {
        user_id: live.userId,
        license_id: resolved.license.id,
        event: 'report_submitted',
        path: '/operator/submit-report',
        user_agent: shortUserAgent(req.headers.get('user-agent'))
      }
    ]);
  } catch (err) {
    console.warn('report_submitted activity log failed:', err);
  }

  return NextResponse.json(redactBackendResponseForOperator(parsed));
}
