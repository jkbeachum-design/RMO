import { NextRequest, NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isLowInvolvement, mergeComplianceSettings } from '@/lib/rules';
import { filterAlertEmails } from '@/lib/alertRecipients';
import {
  getOperatorReminderFlags,
  mergeReminderSettings,
  processLicenseReminders,
  type ReminderActionPreview
} from '@/lib/reportReminders';

type SettingsRow = Record<string, unknown>;

function settingsFromRow(row: SettingsRow | null | undefined) {
  return mergeComplianceSettings(
    row
      ? {
          contract_value_threshold: Number(row.contract_value_threshold),
          permit_required_above: Number(row.permit_required_above),
          min_trades_for_b_general: Number(row.min_trades_for_b_general),
          flag_unverified_subs: row.flag_unverified_subs !== false,
          flag_expired_coi: row.flag_expired_coi !== false,
          flag_workers_comp_exempt_crew: row.flag_workers_comp_exempt_crew !== false,
          flag_scope_mismatch: row.flag_scope_mismatch !== false,
          flag_missing_permit: row.flag_missing_permit !== false,
          low_involvement_days: Number(row.low_involvement_days),
          digest_enabled: row.digest_enabled !== false,
          digest_hour_pt: Number(row.digest_hour_pt),
          alert_email: (row.alert_email as string | null) || null,
          alert_phone: (row.alert_phone as string | null) || null,
          reminder_enabled: row.reminder_enabled === true,
          report_cadence: (row.report_cadence as 'biweekly' | 'weekly' | 'monthly') || 'biweekly',
          report_due_weekday:
            row.report_due_weekday != null ? Number(row.report_due_weekday) : 4,
          report_anchor_date: String(row.report_anchor_date || '2026-10-22').slice(0, 10)
        }
      : null
  );
}

async function sendEmail(to: string, subject: string, text: string) {
  const recipients = filterAlertEmails(to);
  if (!recipients.length) {
    return { skipped: true as const, reason: 'no_allowed_recipients' as const };
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL || 'RMO Compliance <onboarding@resend.dev>';
  if (!apiKey) {
    console.log('DIGEST email (console):', subject, '\n', text, '\n→', recipients.join(', '));
    return { skipped: true as const, reason: 'email_not_configured' as const };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: recipients, subject, text })
  });
  if (!res.ok) {
    console.error('digest email failed', await res.text());
    return { ok: false as const };
  }
  return { ok: true as const };
}

/**
 * Cron or manual digest runner.
 * - With `x-cron-secret` / `?secret=` matching CRON_SECRET|DIGEST_SECRET: all licenses
 * - Authenticated RMO session without secret: membership-scoped MANUAL digest only
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.DIGEST_SECRET;
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const provided =
    req.headers.get('x-cron-secret') || bearer || req.nextUrl.searchParams.get('secret') || '';
  const isCron = Boolean(secret && provided === secret);

  const body = await req.json().catch(() => ({}));
  const dryRun =
    req.nextUrl.searchParams.get('dry_run') === '1' ||
    req.nextUrl.searchParams.get('dryRun') === '1' ||
    body?.dryRun === true ||
    body?.dry_run === true;

  let allowedIds: string[] | null = null;
  let userId: string | null = null;
  let kind: 'MORNING' | 'LOW_INVOLVEMENT' | 'MANUAL' = 'MORNING';

  if (!isCron) {
    const session = getSession();
    if (!session || session.mode !== 'RMO') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const live = await refreshSessionMemberships(session);
    const memberships = await loadMemberships(live.userId);
    allowedIds = membershipLicenseIds(memberships);
    userId = live.userId;
    kind = 'MANUAL';
    if (!allowedIds.length) {
      return NextResponse.json({ error: 'No company memberships' }, { status: 403 });
    }
  }

  const supabase = getSupabaseAdmin();
  let licensesQuery = supabase.from('licenses').select('*');
  if (allowedIds) licensesQuery = licensesQuery.in('id', allowedIds);
  const { data: licenses, error } = await licensesQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  const results = [];
  const reminderActions: ReminderActionPreview[] = [];
  const hourlyCron = req.nextUrl.searchParams.get('hourly') === '1';
  const currentPtHour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(now)
  );

  for (const license of licenses || []) {
    const { data: settingsRow } = await supabase
      .from('compliance_settings')
      .select('*')
      .eq('license_id', license.id)
      .maybeSingle();
    const settings = settingsFromRow(settingsRow);
    const reminderSettings = mergeReminderSettings(settingsRow);
    // Reminders run even when digest email is disabled (separate toggle).
    if (reminderSettings.reminder_enabled) {
      try {
        const actions = await processLicenseReminders({
          licenseId: license.id,
          licenseNumber: license.license_number,
          entityName: license.entity_name || 'company',
          settings: reminderSettings,
          dryRun
        });
        reminderActions.push(...actions);
      } catch (err) {
        console.warn('report reminders failed for', license.license_number, err);
      }
    }

    if (!settings.digest_enabled && kind === 'MORNING') continue;
    // Hourly Vercel cron: only send at each license's chosen hour (Pacific).
    if (isCron && hourlyCron && settings.digest_hour_pt !== currentPtHour) continue;

    const sinceIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: logs }, { data: activities }, { data: operatorMembers }, { data: recentReports }] =
      await Promise.all([
        supabase
          .from('compliance_logs')
          .select('id, flagged, created_at, rmo_reviewed, extracted_data')
          .eq('license_id', license.id)
          .gte('created_at', sinceIso),
        supabase
          .from('supervision_activities')
          .select('id, activity_type, occurred_at')
          .eq('license_id', license.id)
          .gte('occurred_at', sinceIso),
        supabase
          .from('user_licenses')
          .select('user_id, role, users(id, user_name, user_email)')
          .eq('license_id', license.id)
          .in('role', ['OPERATOR', 'FOREMAN', 'PM']),
        supabase
          .from('compliance_logs')
          .select('created_at, extracted_data')
          .eq('license_id', license.id)
          .order('created_at', { ascending: false })
          .limit(200)
      ]);

    const openFlags = (logs || []).filter((l) => l.flagged && !l.rmo_reviewed).length;
    const visits = (activities || []).filter((a) =>
      String(a.activity_type || '').toUpperCase().includes('VISIT')
    ).length;
    const decisions = (activities || []).filter((a) =>
      String(a.activity_type || '').toUpperCase().includes('DECISION')
    ).length;
    const lastActivity =
      (activities || [])
        .map((a) => a.occurred_at)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null;
    const lastReviewed =
      (logs || [])
        .filter((l) => l.rmo_reviewed)
        .map((l) => l.created_at)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null;
    const lastTouch =
      [lastActivity, lastReviewed].filter(Boolean).sort().reverse()[0] || null;
    const lowInvolvement = isLowInvolvement(lastTouch, settings.low_involvement_days, now);
    const days =
      lastTouch == null
        ? null
        : Math.round(
            (now.getTime() - new Date(lastTouch).getTime()) / (24 * 60 * 60 * 1000)
          );

    // Flag CEOs/operators with no attributed report in N days (digest payload only — never email/text operators)
    const inactiveOperators: Array<{ name: string; email: string; days: number | null }> = [];
    const seenOp = new Set<string>();
    const operatorIds: string[] = [];
    const operatorMeta: Array<{ id: string; name: string; email: string }> = [];
    for (const row of operatorMembers || []) {
      const u = (Array.isArray(row.users) ? row.users[0] : row.users) as {
        id?: string;
        user_name?: string;
        user_email?: string;
      } | null;
      if (!u?.id || seenOp.has(u.id)) continue;
      seenOp.add(u.id);
      operatorIds.push(u.id);
      operatorMeta.push({
        id: u.id,
        name: (u.user_name || u.user_email || 'Operator').trim(),
        email: u.user_email || ''
      });
    }

    const submittedByUser = new Map<string, string>();
    if (operatorIds.length) {
      const { data: submittedRows, error: submittedErr } = await supabase
        .from('activity_events')
        .select('user_id, created_at')
        .eq('license_id', license.id)
        .eq('event', 'report_submitted')
        .in('user_id', operatorIds)
        .order('created_at', { ascending: false })
        .limit(200);
      if (!submittedErr) {
        for (const row of submittedRows || []) {
          if (!submittedByUser.has(row.user_id)) {
            submittedByUser.set(row.user_id, row.created_at);
          }
        }
      }
    }

    for (const op of operatorMeta) {
      let lastReport = submittedByUser.get(op.id) || null;
      if (!lastReport) {
        const nameLower = op.name.toLowerCase();
        for (const log of recentReports || []) {
          const extracted = (log.extracted_data || {}) as { operator_name?: string };
          const opName = String(extracted.operator_name || '')
            .trim()
            .toLowerCase();
          if (opName && opName === nameLower) {
            lastReport = log.created_at;
            break;
          }
        }
      }
      const opDays =
        lastReport == null
          ? null
          : Math.round((now.getTime() - new Date(lastReport).getTime()) / (24 * 60 * 60 * 1000));
      if (opDays == null || opDays >= settings.low_involvement_days) {
        inactiveOperators.push({
          name: op.name,
          email: op.email,
          days: opDays
        });
      }
    }

    const inactiveLine = inactiveOperators.length
      ? `Inactive operators (no report in ${settings.low_involvement_days}+ days): ${inactiveOperators
          .map((o) => `${o.name}${o.days != null ? ` (${o.days}d)` : ' (never)'}`)
          .join('; ')}`
      : 'All operators have reported within threshold';

    // Required-report overdue (3+ days) — red flag in digest for RMO
    let overdueReminderLine = 'No required-report overdues (3+ days)';
    try {
      const flags = await getOperatorReminderFlags({
        licenseId: license.id,
        licenseNumber: license.license_number,
        entityName: license.entity_name || 'company',
        settings: reminderSettings,
        operators: operatorMeta
      });
      const overdueList = Array.from(flags.entries()).map(([id, f]) => {
        const op = operatorMeta.find((o) => o.id === id);
        return `${op?.name || id}: ${f.daysOverdue}d overdue (due ${f.dueDate})${f.finalNoticeText ? ' · FINAL NOTICE READY' : ''}`;
      });
      if (overdueList.length) {
        overdueReminderLine = `REQUIRED REPORT OVERDUE (red): ${overdueList.join('; ')}`;
      }
    } catch {
      /* reminder_log / settings may be missing until migration 014 */
    }

    const digestBody = [
      `License ${license.license_number} — ${license.entity_name || 'company'}`,
      `Open flagged logs (30d): ${openFlags}`,
      `Site visits (30d): ${visits}`,
      `Decisions (30d): ${decisions}`,
      `Last involvement: ${lastTouch || 'none on record'}${days != null ? ` (${days} days)` : ''}`,
      lowInvolvement
        ? `LOW INVOLVEMENT: no visits/decisions/reviews for ${settings.low_involvement_days}+ days`
        : 'Involvement within threshold',
      inactiveLine,
      overdueReminderLine
    ].join('\n');

    const rawTo = settings.alert_email || process.env.RMO_ALERT_EMAIL || null;
    const to = filterAlertEmails(rawTo)[0] || null;
    let deliveredEmail = false;
    if (dryRun) {
      console.log('[dry-run] DIGEST email skipped:', digestBody);
    } else if (to) {
      const emailResult = await sendEmail(
        to,
        `[RMO Digest] ${license.license_number}`,
        digestBody
      );
      deliveredEmail = Boolean(emailResult.ok);
    } else if (rawTo) {
      console.log('DIGEST (recipients filtered by allowlist/blocklist):', digestBody);
    } else {
      console.log('DIGEST (no alert_email):', digestBody);
    }

    await supabase.from('digest_runs').insert([
      {
        user_id: userId,
        license_id: license.id,
        kind,
        payload: {
          openFlags,
          visits,
          decisions,
          days,
          lowInvolvement,
          inactiveOperators,
          overdueReminderLine,
          dryRun,
          text: digestBody
        },
        delivered_email: deliveredEmail,
        delivered_sms: false
      }
    ]);

    if (lowInvolvement) {
      const alertBody = `LOW INVOLVEMENT alert for ${license.license_number}: threshold ${settings.low_involvement_days} days.`;
      let lowDelivered = false;
      if (dryRun) {
        console.log('[dry-run] LOW_INVOLVEMENT skipped:', alertBody);
      } else if (to) {
        const lowResult = await sendEmail(
          to,
          `[RMO] Low involvement — ${license.license_number}`,
          alertBody
        );
        lowDelivered = Boolean(lowResult.ok);
      } else {
        console.log('LOW_INVOLVEMENT:', alertBody);
      }
      await supabase.from('digest_runs').insert([
        {
          user_id: userId,
          license_id: license.id,
          kind: 'LOW_INVOLVEMENT',
          payload: { days, threshold: settings.low_involvement_days },
          delivered_email: lowDelivered,
          delivered_sms: false
        }
      ]);
    }

    results.push({
      license_id: license.id,
      license_number: license.license_number,
      openFlags,
      visits,
      decisions,
      days,
      lowInvolvement,
      inactiveOperators,
      overdueReminderLine
    });
  }

  return NextResponse.json({
    ok: true,
    kind,
    dryRun,
    processed: results.length,
    results,
    reminders: reminderActions
  });
}

/** Vercel Cron issues GET with `Authorization: Bearer $CRON_SECRET`. GET is cron-only (no session-triggered sends). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.DIGEST_SECRET;
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || bearer !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return POST(req);
}
