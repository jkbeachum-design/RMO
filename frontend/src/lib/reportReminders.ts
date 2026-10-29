/**
 * Required CEO report reminders — cadence + project-event dues.
 * Driven by the daily digest cron (America/Los_Angeles calendar days).
 */

import { getSupabaseAdmin } from './supabase';
import { filterOperatorReminderEmails } from './alertRecipients';
import { appOrigin, loadAlertSettings, sendNtfy } from './rmoAlerts';
import {
  addDaysYmd,
  buildDueSoonEmail,
  buildFinalNoticeText,
  buildPastDueEmail,
  daysBetweenYmd,
  listCadenceDueDates,
  mergeReminderSettings,
  pacificYmd,
  reportSatisfiesCadenceDue,
  reportSatisfiesProjectDue,
  stepForToday,
  type DueKind,
  type ReminderSettings,
  type ReminderStep
} from './reportReminderSchedule';

export * from './reportReminderSchedule';

export type DueItem = {
  dueDate: string;
  dueKind: DueKind;
  projectId: string | null;
  label: string;
};

async function sendReminderEmail(
  to: string,
  subject: string,
  text: string,
  dryRun: boolean
): Promise<{ ok: boolean; skipped?: string; dryRun?: boolean }> {
  const recipients = filterOperatorReminderEmails(to);
  if (!recipients.length) return { ok: false, skipped: 'no_recipients' };
  if (dryRun) {
    console.log('[dry-run] operator reminder email →', recipients.join(', '), subject);
    return { ok: true, dryRun: true };
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL || 'RMO Compliance <onboarding@resend.dev>';
  if (!apiKey) {
    console.log(
      'OPERATOR reminder email (console, RESEND_API_KEY unset):',
      subject,
      '\n→',
      recipients.join(', ')
    );
    return { ok: false, skipped: 'email_not_configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipients, subject, text }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      console.error('operator reminder email failed', await res.text());
      return { ok: false, skipped: 'send_failed' };
    }
    return { ok: true };
  } catch {
    return { ok: false, skipped: 'network' };
  }
}

export type ReminderActionPreview = {
  license_id: string;
  license_number: string;
  user_id: string;
  user_email: string;
  user_name: string;
  due_date: string;
  due_kind: DueKind;
  project_id: string | null;
  step: ReminderStep;
  channel: 'email' | 'ntfy' | 'none';
  status: 'would_send' | 'sent' | 'skipped' | 'already_sent';
  detail?: string;
};

export type OperatorDueStatus = {
  due: boolean;
  overdue: boolean;
  dueDate: string | null;
  daysUntil: number | null;
  daysOverdue: number | null;
  label: string | null;
  companyName: string | null;
  licenseNumber: string | null;
};

export async function evaluateLicenseDues(input: {
  licenseId: string;
  licenseNumber: string;
  entityName: string;
  settings: ReminderSettings;
  todayYmd: string;
}): Promise<{
  operators: Array<{ id: string; name: string; email: string }>;
  dues: DueItem[];
  reportYmdsByUser: Map<string, string[]>;
  licenseReportYmds: string[];
}> {
  const supabase = getSupabaseAdmin();
  const { data: members } = await supabase
    .from('user_licenses')
    .select('user_id, role, users(id, user_name, user_email)')
    .eq('license_id', input.licenseId)
    .in('role', ['OPERATOR', 'FOREMAN', 'PM', 'RMO', 'ADMIN']);

  // The RMO/admin supervises; they are never required to file reports, even if
  // they also hold an OPERATOR row on the license.
  const supervisorIds = new Set(
    (members || [])
      .filter((m) => m.role === 'RMO' || m.role === 'ADMIN')
      .map((m) => m.user_id as string)
  );

  const operatorsMap = new Map<string, { id: string; name: string; email: string }>();
  for (const row of members || []) {
    const u = (Array.isArray(row.users) ? row.users[0] : row.users) as {
      id?: string;
      user_name?: string;
      user_email?: string;
    } | null;
    if (!u?.id || operatorsMap.has(u.id) || supervisorIds.has(u.id)) continue;
    if (row.role === 'RMO' || row.role === 'ADMIN') continue;
    operatorsMap.set(u.id, {
      id: u.id,
      name: (u.user_name || u.user_email || 'Operator').trim(),
      email: (u.user_email || '').trim()
    });
  }
  const operators = Array.from(operatorsMap.values());

  const dues: DueItem[] = [];
  const cadenceDates = listCadenceDueDates(
    input.settings.report_anchor_date,
    input.settings.report_cadence,
    addDaysYmd(input.todayYmd, 14),
    90
  );
  for (const d of cadenceDates) {
    dues.push({
      dueDate: d,
      dueKind: 'cadence',
      projectId: null,
      label: `Biweekly report due ${d}`
    });
  }

  const { data: projects } = await supabase
    .from('projects')
    .select('id, project_address, start_date, end_date, status, created_at, updated_at')
    .eq('license_id', input.licenseId)
    .order('created_at', { ascending: false })
    .limit(200);

  for (const p of projects || []) {
    const events: Array<{ ymd: string; why: string }> = [];
    if (p.created_at) {
      events.push({ ymd: pacificYmd(new Date(p.created_at)), why: 'created' });
    }
    if (p.start_date) {
      events.push({ ymd: String(p.start_date).slice(0, 10), why: 'started' });
    }
    if (String(p.status || '').toUpperCase() === 'COMPLETED') {
      const done =
        (p.end_date && String(p.end_date).slice(0, 10)) ||
        (p.updated_at ? pacificYmd(new Date(p.updated_at)) : null);
      if (done) events.push({ ymd: done, why: 'completed' });
    }
    const addr = p.project_address || 'project';
    for (const ev of events) {
      const dueDate = addDaysYmd(ev.ymd, 3);
      dues.push({
        dueDate,
        dueKind: 'project_event',
        projectId: p.id,
        label: `Report within 3 days of project ${ev.why} (${addr})`
      });
    }
  }

  const { data: logs } = await supabase
    .from('compliance_logs')
    .select('created_at, extracted_data')
    .eq('license_id', input.licenseId)
    .order('created_at', { ascending: false })
    .limit(300);

  const { data: submitted } = await supabase
    .from('activity_events')
    .select('user_id, created_at')
    .eq('license_id', input.licenseId)
    .eq('event', 'report_submitted')
    .order('created_at', { ascending: false })
    .limit(300);

  const licenseReportYmds = (logs || []).map((l) => pacificYmd(new Date(l.created_at)));
  const reportYmdsByUser = new Map<string, string[]>();
  for (const op of operators) {
    const fromActivity = (submitted || [])
      .filter((s) => s.user_id === op.id)
      .map((s) => pacificYmd(new Date(s.created_at)));
    const nameLower = op.name.toLowerCase();
    const fromLogs = (logs || [])
      .filter((l) => {
        const n = String(
          (l.extracted_data as { operator_name?: string } | null)?.operator_name || ''
        )
          .trim()
          .toLowerCase();
        return n && n === nameLower;
      })
      .map((l) => pacificYmd(new Date(l.created_at)));
    reportYmdsByUser.set(op.id, Array.from(new Set([...fromActivity, ...fromLogs])).sort());
  }

  return { operators, dues, reportYmdsByUser, licenseReportYmds };
}

function isDueSatisfied(
  due: DueItem,
  reportYmds: string[],
  cadenceDates: string[],
  todayYmd?: string
): boolean {
  // A report filed late (after the due date, up to today) stops further
  // past-due / overdue escalation for that due. For cadence dues the late
  // report must land before the next cadence due date.
  if (todayYmd && todayYmd > due.dueDate) {
    let lateEnd = todayYmd;
    if (due.dueKind === 'cadence') {
      const idx = cadenceDates.indexOf(due.dueDate);
      const next = idx >= 0 && idx + 1 < cadenceDates.length ? cadenceDates[idx + 1] : null;
      if (next && next < lateEnd) lateEnd = next;
    }
    if (reportYmds.some((r) => r > due.dueDate && r <= lateEnd)) return true;
  }
  if (due.dueKind === 'cadence') {
    const idx = cadenceDates.indexOf(due.dueDate);
    const prev = idx > 0 ? cadenceDates[idx - 1] : null;
    return reportSatisfiesCadenceDue(reportYmds, due.dueDate, prev);
  }
  const eventYmd = addDaysYmd(due.dueDate, -3);
  return reportSatisfiesProjectDue(reportYmds, eventYmd, due.dueDate);
}

async function alreadySent(input: {
  licenseId: string;
  userId: string;
  dueDate: string;
  dueKind: DueKind;
  projectId: string | null;
  step: ReminderStep;
}): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('reminder_log')
    .select('id')
    .eq('license_id', input.licenseId)
    .eq('user_id', input.userId)
    .eq('due_date', input.dueDate)
    .eq('due_kind', input.dueKind)
    .eq('step', input.step)
    .limit(1);
  if (input.projectId) q = q.eq('project_id', input.projectId);
  else q = q.is('project_id', null);
  const { data } = await q.maybeSingle();
  return Boolean(data?.id);
}

async function recordSent(input: {
  licenseId: string;
  userId: string;
  dueDate: string;
  dueKind: DueKind;
  projectId: string | null;
  step: ReminderStep;
  channel: 'email' | 'ntfy' | 'none';
  payload: Record<string, unknown>;
  dryRun: boolean;
}): Promise<void> {
  if (input.dryRun) return;
  const supabase = getSupabaseAdmin();
  await supabase.from('reminder_log').insert([
    {
      license_id: input.licenseId,
      user_id: input.userId,
      due_date: input.dueDate,
      due_kind: input.dueKind,
      project_id: input.projectId,
      step: input.step,
      channel: input.channel,
      payload: input.payload
    }
  ]);
}

async function notifyRmosReminder(input: {
  licenseId: string;
  title: string;
  message: string;
  click?: string;
  dryRun: boolean;
}): Promise<{ ok: boolean; skipped?: string }> {
  if (input.dryRun) {
    console.log('[dry-run] ntfy to RMOs:', input.title);
    return { ok: true, skipped: 'dry_run' };
  }
  const supabase = getSupabaseAdmin();
  const { data: members } = await supabase
    .from('user_licenses')
    .select('user_id')
    .eq('license_id', input.licenseId)
    .in('role', ['RMO', 'ADMIN']);
  const ids = Array.from(new Set((members || []).map((m) => m.user_id as string)));
  let any = false;
  for (const uid of ids) {
    const { settings } = await loadAlertSettings(uid);
    const r = await sendNtfy(settings, {
      title: input.title,
      message: input.message,
      click: input.click || `${appOrigin()}/dashboard/supervision`,
      tags: 'warning,clipboard',
      priority: 'high'
    });
    if (r.ok) any = true;
  }
  return any ? { ok: true } : { ok: false, skipped: 'no_ntfy' };
}

export async function processLicenseReminders(input: {
  licenseId: string;
  licenseNumber: string;
  entityName: string;
  settings: ReminderSettings;
  todayYmd?: string;
  dryRun?: boolean;
}): Promise<ReminderActionPreview[]> {
  if (!input.settings.reminder_enabled) return [];
  const todayYmd = input.todayYmd || pacificYmd();
  const dryRun = Boolean(input.dryRun);
  const evaluated = await evaluateLicenseDues({
    licenseId: input.licenseId,
    licenseNumber: input.licenseNumber,
    entityName: input.entityName,
    settings: input.settings,
    todayYmd
  });

  const cadenceDates = evaluated.dues
    .filter((d) => d.dueKind === 'cadence')
    .map((d) => d.dueDate)
    .sort();

  const actions: ReminderActionPreview[] = [];

  for (const due of evaluated.dues) {
    const step = stepForToday(due.dueDate, todayYmd);
    if (!step) continue;

    for (const op of evaluated.operators) {
      const reports = evaluated.reportYmdsByUser.get(op.id) || [];
      const effective =
        reports.length > 0
          ? reports
          : evaluated.operators.length === 1
            ? evaluated.licenseReportYmds
            : reports;

      if (isDueSatisfied(due, effective, cadenceDates, todayYmd)) continue;

      const base = {
        license_id: input.licenseId,
        license_number: input.licenseNumber,
        user_id: op.id,
        user_email: op.email,
        user_name: op.name,
        due_date: due.dueDate,
        due_kind: due.dueKind,
        project_id: due.projectId
      };

      if (
        await alreadySent({
          licenseId: input.licenseId,
          userId: op.id,
          dueDate: due.dueDate,
          dueKind: due.dueKind,
          projectId: due.projectId,
          step
        })
      ) {
        actions.push({ ...base, step, channel: 'none', status: 'already_sent' });
        continue;
      }

      if (step === 'due_soon') {
        const mail = buildDueSoonEmail({
          operatorName: op.name,
          companyName: input.entityName,
          licenseNumber: input.licenseNumber,
          dueDate: due.dueDate,
          origin: appOrigin()
        });
        const sent = await sendReminderEmail(op.email, mail.subject, mail.text, dryRun);
        if (sent.ok) {
          await recordSent({
            licenseId: input.licenseId,
            userId: op.id,
            dueDate: due.dueDate,
            dueKind: due.dueKind,
            projectId: due.projectId,
            step,
            channel: 'email',
            payload: { subject: mail.subject, dryRun },
            dryRun
          });
        }
        actions.push({
          ...base,
          step,
          channel: 'email',
          status: dryRun ? 'would_send' : sent.ok ? 'sent' : 'skipped',
          detail: sent.skipped || mail.subject
        });
      } else if (step === 'past_due') {
        const mail = buildPastDueEmail({
          operatorName: op.name,
          companyName: input.entityName,
          licenseNumber: input.licenseNumber,
          dueDate: due.dueDate,
          origin: appOrigin()
        });
        const sent = await sendReminderEmail(op.email, mail.subject, mail.text, dryRun);
        if (sent.ok) {
          await recordSent({
            licenseId: input.licenseId,
            userId: op.id,
            dueDate: due.dueDate,
            dueKind: due.dueKind,
            projectId: due.projectId,
            step,
            channel: 'email',
            payload: { subject: mail.subject, dryRun },
            dryRun
          });
        }
        actions.push({
          ...base,
          step,
          channel: 'email',
          status: dryRun ? 'would_send' : sent.ok ? 'sent' : 'skipped',
          detail: sent.skipped || mail.subject
        });
      } else if (step === 'overdue_3d') {
        const title = `Operator report 3+ days overdue — ${input.entityName}`;
        const message = [
          `${op.name} (${op.email}) has not filed a required report.`,
          `Due: ${due.dueDate} (${due.dueKind}).`,
          `Company: ${input.entityName}, CSLB #${input.licenseNumber}.`,
          due.label,
          'Operator flagged red on Activity / digest. No email sent to the operator.'
        ].join('\n');
        const ntfy = await notifyRmosReminder({
          licenseId: input.licenseId,
          title,
          message,
          dryRun
        });
        if (ntfy.ok || dryRun) {
          await recordSent({
            licenseId: input.licenseId,
            userId: op.id,
            dueDate: due.dueDate,
            dueKind: due.dueKind,
            projectId: due.projectId,
            step,
            channel: 'ntfy',
            payload: { title, dryRun },
            dryRun
          });
        }
        actions.push({
          ...base,
          step,
          channel: 'ntfy',
          status: dryRun ? 'would_send' : ntfy.ok ? 'sent' : 'skipped',
          detail: ntfy.skipped || title
        });
      } else if (step === 'overdue_7d') {
        const daysOverdue = daysBetweenYmd(due.dueDate, todayYmd);
        const finalText = buildFinalNoticeText({
          operatorName: op.name,
          operatorEmail: op.email,
          companyName: input.entityName,
          licenseNumber: input.licenseNumber,
          dueDate: due.dueDate,
          daysOverdue,
          origin: appOrigin()
        });
        const title = `Final notice recommended — ${op.name} / ${input.entityName}`;
        const message = [
          `${op.name} is ${daysOverdue} days past due (due ${due.dueDate}).`,
          `Company: ${input.entityName}, CSLB #${input.licenseNumber}.`,
          'A final-notice email is recommended. Copy is ready in Supervision → Operator activity.',
          'No automatic email was sent to the operator.'
        ].join('\n');
        const ntfy = await notifyRmosReminder({
          licenseId: input.licenseId,
          title,
          message,
          dryRun
        });
        if (ntfy.ok || dryRun) {
          await recordSent({
            licenseId: input.licenseId,
            userId: op.id,
            dueDate: due.dueDate,
            dueKind: due.dueKind,
            projectId: due.projectId,
            step,
            channel: 'ntfy',
            payload: { title, finalNotice: finalText, dryRun },
            dryRun
          });
        }
        actions.push({
          ...base,
          step,
          channel: 'ntfy',
          status: dryRun ? 'would_send' : ntfy.ok ? 'sent' : 'skipped',
          detail: ntfy.skipped || title
        });
      }
    }
  }

  return actions;
}

export async function getOperatorDueBanner(input: {
  userId: string;
  licenseIds: string[];
  todayYmd?: string;
}): Promise<OperatorDueStatus> {
  const empty: OperatorDueStatus = {
    due: false,
    overdue: false,
    dueDate: null,
    daysUntil: null,
    daysOverdue: null,
    label: null,
    companyName: null,
    licenseNumber: null
  };
  if (!input.licenseIds.length) return empty;
  const todayYmd = input.todayYmd || pacificYmd();
  const supabase = getSupabaseAdmin();

  for (const licenseId of input.licenseIds) {
    const { data: license } = await supabase
      .from('licenses')
      .select('id, license_number, entity_name')
      .eq('id', licenseId)
      .maybeSingle();
    if (!license) continue;
    const { data: settingsRow } = await supabase
      .from('compliance_settings')
      .select('*')
      .eq('license_id', licenseId)
      .maybeSingle();
    const settings = mergeReminderSettings(settingsRow);
    if (!settings.reminder_enabled) continue;

    const evaluated = await evaluateLicenseDues({
      licenseId,
      licenseNumber: license.license_number,
      entityName: license.entity_name || 'company',
      settings,
      todayYmd
    });
    const cadenceDates = evaluated.dues
      .filter((d) => d.dueKind === 'cadence')
      .map((d) => d.dueDate)
      .sort();
    const reports = evaluated.reportYmdsByUser.get(input.userId) || [];
    const effective =
      reports.length > 0
        ? reports
        : evaluated.operators.length === 1
          ? evaluated.licenseReportYmds
          : reports;

    let best: OperatorDueStatus | null = null;
    for (const due of evaluated.dues) {
      if (isDueSatisfied(due, effective, cadenceDates, todayYmd)) continue;
      const delta = daysBetweenYmd(todayYmd, due.dueDate);
      const overdue = delta < 0;
      const daysUntil = overdue ? null : delta;
      const daysOverdue = overdue ? -delta : null;
      if (!overdue && (daysUntil == null || daysUntil > 3)) continue;
      const candidate: OperatorDueStatus = {
        due: true,
        overdue,
        dueDate: due.dueDate,
        daysUntil,
        daysOverdue,
        label: due.label,
        companyName: license.entity_name,
        licenseNumber: license.license_number
      };
      if (
        !best ||
        (candidate.overdue && !best.overdue) ||
        (candidate.overdue &&
          best.overdue &&
          (candidate.daysOverdue || 0) > (best.daysOverdue || 0)) ||
        (!candidate.overdue &&
          !best.overdue &&
          (candidate.daysUntil || 99) < (best.daysUntil || 99))
      ) {
        best = candidate;
      }
    }
    if (best) return best;
  }
  return empty;
}

export async function getOperatorReminderFlags(input: {
  licenseId: string;
  licenseNumber: string;
  entityName: string;
  settings: ReminderSettings;
  operators: Array<{ id: string; name: string; email: string }>;
  todayYmd?: string;
}): Promise<
  Map<
    string,
    {
      dueDate: string;
      daysOverdue: number;
      red: boolean;
      finalNoticeText: string | null;
      label: string;
    }
  >
> {
  const todayYmd = input.todayYmd || pacificYmd();
  const out = new Map<
    string,
    {
      dueDate: string;
      daysOverdue: number;
      red: boolean;
      finalNoticeText: string | null;
      label: string;
    }
  >();
  if (!input.settings.reminder_enabled) return out;

  const evaluated = await evaluateLicenseDues({
    licenseId: input.licenseId,
    licenseNumber: input.licenseNumber,
    entityName: input.entityName,
    settings: input.settings,
    todayYmd
  });
  const cadenceDates = evaluated.dues
    .filter((d) => d.dueKind === 'cadence')
    .map((d) => d.dueDate)
    .sort();

  for (const op of input.operators) {
    const reports = evaluated.reportYmdsByUser.get(op.id) || [];
    const effective =
      reports.length > 0
        ? reports
        : evaluated.operators.length === 1
          ? evaluated.licenseReportYmds
          : reports;

    let worst: {
      dueDate: string;
      daysOverdue: number;
      red: boolean;
      finalNoticeText: string | null;
      label: string;
    } | null = null;

    for (const due of evaluated.dues) {
      if (due.dueDate > todayYmd) continue;
      if (isDueSatisfied(due, effective, cadenceDates, todayYmd)) continue;
      const daysOverdue = daysBetweenYmd(due.dueDate, todayYmd);
      if (daysOverdue < 3) continue;
      const finalNoticeText =
        daysOverdue >= 7
          ? buildFinalNoticeText({
              operatorName: op.name,
              operatorEmail: op.email,
              companyName: input.entityName,
              licenseNumber: input.licenseNumber,
              dueDate: due.dueDate,
              daysOverdue,
              origin: appOrigin()
            })
          : null;
      const candidate = {
        dueDate: due.dueDate,
        daysOverdue,
        red: true,
        finalNoticeText,
        label: due.label
      };
      if (!worst || candidate.daysOverdue > worst.daysOverdue) worst = candidate;
    }
    if (worst) out.set(op.id, worst);
  }
  return out;
}
