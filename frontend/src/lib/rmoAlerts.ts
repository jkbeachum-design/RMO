import { getSupabaseAdmin } from './supabase';
import { filterAlertEmails, parseCsvEnv } from './alertRecipients';

/**
 * Outside-portal alerts to RMOs (ntfy push + Resend email) when a CEO submits a report.
 * RMO-only: never call these with CEO recipients. Flag details are included only here.
 */

export type AlertSettings = {
  ntfy_server: string;
  ntfy_topic: string | null;
  ntfy_token: string | null;
  alert_emails: string | null;
  notify_new_report: boolean;
  notify_flagged: boolean;
};

export const DEFAULT_NTFY_SERVER = 'https://ntfy.sh';

export function envAlertDefaults(): AlertSettings {
  return {
    ntfy_server: (process.env.NTFY_URL || DEFAULT_NTFY_SERVER).replace(/\/$/, ''),
    ntfy_topic: process.env.NTFY_TOPIC || null,
    ntfy_token: process.env.NTFY_TOKEN || null,
    alert_emails: process.env.RMO_ALERT_EMAIL || null,
    notify_new_report: true,
    notify_flagged: true
  };
}

export async function loadAlertSettings(userId: string): Promise<{ settings: AlertSettings; saved: boolean }> {
  const defaults = envAlertDefaults();
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('rmo_alert_settings')
    .select('ntfy_server, ntfy_topic, ntfy_token, alert_emails, notify_new_report, notify_flagged')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return { settings: defaults, saved: false };
  return {
    saved: true,
    settings: {
      ntfy_server: (data.ntfy_server || defaults.ntfy_server).replace(/\/$/, ''),
      ntfy_topic: data.ntfy_topic || defaults.ntfy_topic,
      ntfy_token: data.ntfy_token || (data.ntfy_topic ? null : defaults.ntfy_token),
      alert_emails: data.alert_emails ?? defaults.alert_emails,
      notify_new_report: data.notify_new_report !== false,
      notify_flagged: data.notify_flagged !== false
    }
  };
}

export function isSafeNtfyServer(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname);
  } catch {
    return false;
  }
}

export async function sendNtfy(
  s: Pick<AlertSettings, 'ntfy_server' | 'ntfy_topic' | 'ntfy_token'>,
  msg: { title: string; message: string; click?: string; tags?: string; priority?: 'default' | 'high' }
): Promise<{ ok: boolean; status?: number; skipped?: string }> {
  if (!s.ntfy_topic) return { ok: false, skipped: 'no_topic' };
  if (!isSafeNtfyServer(s.ntfy_server)) return { ok: false, skipped: 'bad_server' };
  const headers: Record<string, string> = {
    Title: msg.title.replace(/[^\x20-\x7E]/g, '-').slice(0, 200),
    Priority: msg.priority || 'default',
    Tags: msg.tags || 'clipboard'
  };
  if (msg.click) headers.Click = msg.click;
  if (s.ntfy_token) headers.Authorization = `Bearer ${s.ntfy_token}`;
  try {
    const res = await fetch(`${s.ntfy_server}/${encodeURIComponent(s.ntfy_topic)}`, {
      method: 'POST',
      headers,
      body: msg.message.slice(0, 3500),
      signal: AbortSignal.timeout(5000)
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, skipped: 'network' };
  }
}

export async function sendAlertEmail(
  rawTo: string | null,
  subject: string,
  text: string
): Promise<{ ok: boolean; skipped?: string; recipients: number }> {
  const to = filterAlertEmails(rawTo || '');
  if (!to.length) return { ok: false, skipped: 'no_allowed_recipients', recipients: 0 };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('RMO alert email (console only, RESEND_API_KEY unset):', subject);
    return { ok: false, skipped: 'email_not_configured', recipients: to.length };
  }
  const from = process.env.ALERT_FROM_EMAIL || 'RMO Compliance <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) console.error('RMO alert email failed', res.status);
    return { ok: res.ok, recipients: to.length };
  } catch {
    return { ok: false, skipped: 'network', recipients: to.length };
  }
}

export function appOrigin(): string {
  return (process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://rmo.buildmyoffice.com').replace(/\/$/, '');
}

type FlagLike = { reason?: string; flag?: string; message?: string; severity?: string } | string;

function flagLines(riskFlags: Record<string, unknown> | null | undefined): string[] {
  const raw = (riskFlags?.raw_flags || riskFlags?.critical_flags || []) as FlagLike[];
  return raw
    .map((f) => (typeof f === 'string' ? f : `${f.severity ? `[${f.severity}] ` : ''}${f.reason || f.message || f.flag || ''}`))
    .filter(Boolean)
    .slice(0, 5)
    .map((t) => `- ${String(t).slice(0, 160)}`);
}

export type ReportAlertContent = {
  title: string;
  body: string;
  flagged: boolean;
  click: string;
};

export function buildReportAlert(input: {
  logId: string;
  ceoName: string | null;
  companyName: string | null;
  licenseNumber: string | null;
  projects: string[];
  riskFlags: Record<string, unknown> | null;
  includeFlags: boolean;
}): ReportAlertContent {
  const flagged = Boolean(input.riskFlags?.flagged) || flagLines(input.riskFlags).length > 0;
  const company = input.companyName || (input.licenseNumber ? `License ${input.licenseNumber}` : 'a company');
  const lines = [
    'New report submitted',
    `CEO: ${input.ceoName || 'Unknown'}`,
    `Company: ${company}`,
    `Project${input.projects.length === 1 ? '' : 's'}: ${input.projects.length ? input.projects.slice(0, 5).join('; ') : 'none listed'}`
  ];
  if (input.includeFlags && flagged) {
    const fl = flagLines(input.riskFlags);
    lines.push('', `Flags for your review (${fl.length || 'see log'}):`, ...fl);
  }
  const click = `${appOrigin()}/dashboard/${input.logId}`;
  lines.push('', `Open: ${click}`);
  return {
    title: `${input.includeFlags && flagged ? 'FLAGGED: ' : ''}New report - ${company}`,
    body: lines.join('\n'),
    flagged,
    click
  };
}

/** Never throws. Sends to every RMO/ADMIN member of the log's license per their settings. */
export async function notifyRmosOfReport(logId: string): Promise<Array<Record<string, unknown>>> {
  const results: Array<Record<string, unknown>> = [];
  try {
    const supabase = getSupabaseAdmin();
    const { data: log } = await supabase
      .from('compliance_logs')
      .select('id, license_id, extracted_data, risk_flags')
      .eq('id', logId)
      .maybeSingle();
    if (!log?.license_id) return results;
    const { data: license } = await supabase
      .from('licenses')
      .select('license_number, entity_name')
      .eq('id', log.license_id)
      .maybeSingle();
    const { data: members } = await supabase
      .from('user_licenses')
      .select('user_id, role')
      .eq('license_id', log.license_id)
      .in('role', ['RMO', 'ADMIN']);
    const userIds = Array.from(new Set((members || []).map((m) => m.user_id as string)));
    const extracted = (log.extracted_data || {}) as Record<string, unknown>;
    const projects = Array.isArray(extracted.projects)
      ? (extracted.projects as Array<Record<string, unknown>>)
          .map((p) => String(p.address || p.project_address || '').trim())
          .filter(Boolean)
      : [];

    const { data: users } = userIds.length
      ? await supabase.from('users').select('id, user_email').in('id', userIds)
      : { data: [] as Array<{ id: string; user_email: string }> };
    for (const uid of userIds) {
      const memberEmail = (users || []).find((u) => u.id === uid)?.user_email || null;
      const { settings } = await loadAlertSettings(uid);
      const content = buildReportAlert({
        logId,
        ceoName: (extracted.operator_name as string) || null,
        companyName: license?.entity_name || null,
        licenseNumber: license?.license_number || null,
        projects,
        riskFlags: (log.risk_flags || null) as Record<string, unknown> | null,
        includeFlags: settings.notify_flagged
      });
      const wanted = settings.notify_new_report || (content.flagged && settings.notify_flagged);
      if (!wanted) {
        results.push({ uid, skipped: 'disabled' });
        continue;
      }
      const [push, email] = await Promise.all([
        sendNtfy(settings, {
          title: content.title,
          message: content.body,
          click: content.click,
          tags: content.flagged && settings.notify_flagged ? 'warning,clipboard' : 'clipboard',
          priority: content.flagged && settings.notify_flagged ? 'high' : 'default'
        }),
        sendAlertEmail(settings.alert_emails || memberEmail, `[RMO] ${content.title}`, content.body)
      ]);
      results.push({ uid, push, email });
    }
  } catch (err) {
    console.error('notifyRmosOfReport failed', err);
  }
  return results;
}

export { parseCsvEnv };
