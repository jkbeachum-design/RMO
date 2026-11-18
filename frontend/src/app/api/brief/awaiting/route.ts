import { NextRequest, NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  evaluateLicenseDues,
  isDueSatisfied,
  mergeReminderSettings,
  pacificYmd
} from '@/lib/reportReminders';

/**
 * RMO briefing: operators awaiting reports + unreviewed logs.
 * Auth: x-cron-secret = CRON_SECRET|DIGEST_SECRET, or an RMO session.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.DIGEST_SECRET;
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const provided =
    req.headers.get('x-cron-secret') || bearer || req.nextUrl.searchParams.get('secret') || '';
  const isCron = Boolean(secret && provided === secret);

  let allowedIds: string[] | null = null;

  if (!isCron) {
    const session = getSession();
    if (!session || session.mode !== 'RMO') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const live = await refreshSessionMemberships(session);
    const memberships = await loadMemberships(live.userId);
    allowedIds = membershipLicenseIds(memberships);
    if (!allowedIds.length) {
      return NextResponse.json({ error: 'No company memberships' }, { status: 403 });
    }
  }

  const supabase = getSupabaseAdmin();
  let licensesQuery = supabase
    .from('licenses')
    .select('id, license_number, entity_name');
  if (allowedIds) licensesQuery = licensesQuery.in('id', allowedIds);
  const { data: licenses, error } = await licensesQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const todayYmd = pacificYmd();
  const operatorsOut: Array<{
    license: string;
    company: string;
    name: string;
    last_report_at: string | null;
    last_sign_in_at: string | null;
    last_due: string | null;
    next_due: string | null;
    missed_last_due: boolean;
    next_due_unfiled: boolean;
    reminders_enabled: boolean;
  }> = [];

  const unsignedReports: Array<{
    id: string;
    license: string;
    company: string;
    created_at: string;
    flagged: boolean;
    operator_name: string | null;
  }> = [];

  let remindersLastSentAt: string | null = null;

  for (const license of licenses || []) {
    const { data: settingsRow } = await supabase
      .from('compliance_settings')
      .select('*')
      .eq('license_id', license.id)
      .maybeSingle();
    const reminderSettings = mergeReminderSettings(settingsRow);

    const evaluated = await evaluateLicenseDues({
      licenseId: license.id,
      licenseNumber: license.license_number,
      entityName: license.entity_name || 'company',
      settings: reminderSettings,
      todayYmd
    });

    const cadenceDates = evaluated.dues
      .filter((d) => d.dueKind === 'cadence')
      .map((d) => d.dueDate)
      .sort();

    const allDueDates = evaluated.dues.map((d) => d.dueDate).sort();
    const pastDues = allDueDates.filter((d) => d < todayYmd);
    const futureOrToday = allDueDates.filter((d) => d >= todayYmd);
    const lastDue = pastDues.length ? pastDues[pastDues.length - 1] : null;
    const nextDue = futureOrToday.length ? futureOrToday[0] : null;

    const operatorIds = evaluated.operators.map((o) => o.id);
    const lastSignInByUser = new Map<string, string>();
    const lastReportByUser = new Map<string, string>();

    if (operatorIds.length) {
      const [{ data: signIns }, { data: submitted }] = await Promise.all([
        supabase
          .from('activity_events')
          .select('user_id, created_at')
          .eq('license_id', license.id)
          .eq('event', 'sign_in')
          .in('user_id', operatorIds)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('activity_events')
          .select('user_id, created_at')
          .eq('license_id', license.id)
          .eq('event', 'report_submitted')
          .in('user_id', operatorIds)
          .order('created_at', { ascending: false })
          .limit(200)
      ]);
      for (const row of signIns || []) {
        if (!lastSignInByUser.has(row.user_id)) {
          lastSignInByUser.set(row.user_id, row.created_at);
        }
      }
      for (const row of submitted || []) {
        if (!lastReportByUser.has(row.user_id)) {
          lastReportByUser.set(row.user_id, row.created_at);
        }
      }
    }

    for (const op of evaluated.operators) {
      const reports = evaluated.reportYmdsByUser.get(op.id) || [];
      const effective =
        reports.length > 0
          ? reports
          : evaluated.operators.length === 1
            ? evaluated.licenseReportYmds
            : reports;

      let missedLastDue = false;
      if (lastDue) {
        const lastDueItem = evaluated.dues.find((d) => d.dueDate === lastDue);
        if (lastDueItem) {
          missedLastDue = !isDueSatisfied(lastDueItem, effective, cadenceDates, todayYmd);
        }
      }

      let nextDueUnfiled = false;
      if (nextDue) {
        const nextDueItem = evaluated.dues.find((d) => d.dueDate === nextDue);
        if (nextDueItem) {
          nextDueUnfiled = !isDueSatisfied(nextDueItem, effective, cadenceDates, todayYmd);
        }
      }

      const reportYmds = effective;
      const lastReportYmd = reportYmds.length ? reportYmds[reportYmds.length - 1] : null;
      const lastReportAt =
        lastReportByUser.get(op.id) ||
        (lastReportYmd ? `${lastReportYmd}T12:00:00.000Z` : null);

      operatorsOut.push({
        license: license.license_number,
        company: license.entity_name || 'company',
        name: op.name,
        last_report_at: lastReportAt,
        last_sign_in_at: lastSignInByUser.get(op.id) || null,
        last_due: lastDue,
        next_due: nextDue,
        missed_last_due: missedLastDue,
        next_due_unfiled: nextDueUnfiled,
        reminders_enabled: reminderSettings.reminder_enabled
      });
    }

    const { data: openLogs } = await supabase
      .from('compliance_logs')
      .select('id, created_at, flagged, extracted_data, rmo_reviewed')
      .eq('license_id', license.id)
      .or('rmo_reviewed.is.null,rmo_reviewed.eq.false')
      .order('created_at', { ascending: false })
      .limit(50);

    for (const log of openLogs || []) {
      const extracted = (log.extracted_data || {}) as { operator_name?: string };
      unsignedReports.push({
        id: log.id,
        license: license.license_number,
        company: license.entity_name || 'company',
        created_at: log.created_at,
        flagged: Boolean(log.flagged),
        operator_name: extracted.operator_name || null
      });
    }

    const { data: lastReminder } = await supabase
      .from('reminder_log')
      .select('created_at')
      .eq('license_id', license.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      lastReminder?.created_at &&
      (!remindersLastSentAt || lastReminder.created_at > remindersLastSentAt)
    ) {
      remindersLastSentAt = lastReminder.created_at;
    }
  }

  operatorsOut.sort((a, b) => {
    if (a.missed_last_due !== b.missed_last_due) return a.missed_last_due ? -1 : 1;
    if (a.next_due_unfiled !== b.next_due_unfiled) return a.next_due_unfiled ? -1 : 1;
    return a.company.localeCompare(b.company) || a.name.localeCompare(b.name);
  });

  return NextResponse.json({
    operators: operatorsOut,
    unsigned_reports: unsignedReports,
    reminders_last_sent_at: remindersLastSentAt
  });
}
