import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { appOrigin, loadAlertSettings, sendAlertEmail, sendNtfy } from '@/lib/rmoAlerts';
import { getSupabaseAdmin } from '@/lib/supabase';

/** RMO-only: send one test ntfy push + one test email using the caller's saved settings. */
export async function POST() {
  const session = getSession();
  if (!session || session.mode !== 'RMO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const live = await refreshSessionMemberships(session);
  const { settings } = await loadAlertSettings(live.userId);
  const { data: me } = await getSupabaseAdmin()
    .from('users')
    .select('user_email')
    .eq('id', live.userId)
    .maybeSingle();
  const text = `Test alert from RMO Compliance.\nIf you got this, report alerts will reach you here.\n\nOpen: ${appOrigin()}/dashboard`;
  const [push, email] = await Promise.all([
    sendNtfy(settings, {
      title: 'RMO Compliance test alert',
      message: text,
      click: `${appOrigin()}/dashboard`,
      tags: 'white_check_mark'
    }),
    sendAlertEmail(settings.alert_emails || me?.user_email || null, '[RMO] Test alert', text)
  ]);
  return NextResponse.json({ push, email });
}
