import { NextRequest, NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import { DEFAULT_NTFY_SERVER, isSafeNtfyServer, loadAlertSettings } from '@/lib/rmoAlerts';

/** RMO-only alert preferences. The ntfy token is write-only: GET returns only whether one is set. */
async function requireRmo() {
  const session = getSession();
  if (!session || session.mode !== 'RMO') return null;
  const live = await refreshSessionMemberships(session);
  const memberships = await loadMemberships(live.userId);
  const rmoLicenseIds = membershipLicenseIds(
    memberships.filter((m) => m.role === 'RMO' || m.role === 'ADMIN')
  );
  return { live, memberships, rmoLicenseIds };
}

async function loadDigest(licenseId: string | null) {
  if (!licenseId) return { digest_enabled: true, digest_hour_pt: 7 };
  const { data } = await getSupabaseAdmin()
    .from('compliance_settings')
    .select('digest_enabled, digest_hour_pt')
    .eq('license_id', licenseId)
    .maybeSingle();
  return {
    digest_enabled: data ? data.digest_enabled !== false : true,
    digest_hour_pt: data ? Number(data.digest_hour_pt) : 7
  };
}

export async function GET(req: NextRequest) {
  const ctx = await requireRmo();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const licenseId = req.nextUrl.searchParams.get('licenseId') || ctx.rmoLicenseIds[0] || null;
  if (licenseId && !ctx.rmoLicenseIds.includes(licenseId)) {
    return NextResponse.json({ error: 'Forbidden for license' }, { status: 403 });
  }
  const { settings, saved } = await loadAlertSettings(ctx.live.userId);
  return NextResponse.json({
    saved,
    license_id: licenseId,
    licenses: ctx.memberships
      .filter((m) => ctx.rmoLicenseIds.includes(m.license_id))
      .map((m) => ({ id: m.license_id, license_number: m.licenses?.license_number, entity_name: m.licenses?.entity_name }))
      .filter((l, i, a) => a.findIndex((x) => x.id === l.id) === i),
    alerts: {
      ntfy_server: settings.ntfy_server,
      ntfy_topic: settings.ntfy_topic,
      has_ntfy_token: Boolean(settings.ntfy_token),
      alert_emails: settings.alert_emails || '',
      notify_new_report: settings.notify_new_report,
      notify_flagged: settings.notify_flagged
    },
    digest: await loadDigest(licenseId),
    email_configured: Boolean(process.env.RESEND_API_KEY)
  });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireRmo();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const a = body.alerts || {};
  const server = String(a.ntfy_server || DEFAULT_NTFY_SERVER).trim().replace(/\/$/, '');
  if (!isSafeNtfyServer(server)) {
    return NextResponse.json({ error: 'ntfy server must be a public https:// URL' }, { status: 400 });
  }
  const topic = String(a.ntfy_topic || '').trim();
  if (topic && !/^[A-Za-z0-9_-]{1,64}$/.test(topic)) {
    return NextResponse.json({ error: 'ntfy topic may only use letters, numbers, - and _' }, { status: 400 });
  }
  const emails = String(a.alert_emails || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  if (emails.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) || emails.length > 5) {
    return NextResponse.json({ error: 'Enter up to 5 valid email addresses' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const row: Record<string, unknown> = {
    user_id: ctx.live.userId,
    ntfy_server: server,
    ntfy_topic: topic || null,
    alert_emails: emails.join(', ') || null,
    notify_new_report: a.notify_new_report !== false,
    notify_flagged: a.notify_flagged !== false,
    updated_at: new Date().toISOString()
  };
  if (a.clear_ntfy_token === true) row.ntfy_token = null;
  else if (typeof a.ntfy_token === 'string' && a.ntfy_token.trim()) row.ntfy_token = a.ntfy_token.trim().slice(0, 200);

  const { error } = await supabase.from('rmo_alert_settings').upsert(row, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const licenseId = String(body.licenseId || '');
  if (licenseId && body.digest) {
    if (!ctx.rmoLicenseIds.includes(licenseId)) {
      return NextResponse.json({ error: 'Forbidden for license' }, { status: 403 });
    }
    const hour = Math.min(23, Math.max(0, Math.round(Number(body.digest.digest_hour_pt))));
    const digestRow = {
      digest_enabled: body.digest.digest_enabled !== false,
      digest_hour_pt: Number.isFinite(hour) ? hour : 7,
      updated_at: new Date().toISOString()
    };
    const { data: existing } = await supabase
      .from('compliance_settings')
      .select('id')
      .eq('license_id', licenseId)
      .maybeSingle();
    const res = existing?.id
      ? await supabase.from('compliance_settings').update(digestRow).eq('id', existing.id)
      : await supabase.from('compliance_settings').insert([{ ...digestRow, license_id: licenseId }]);
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
