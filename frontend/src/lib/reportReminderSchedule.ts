/**
 * Pure schedule / copy helpers for required CEO report reminders.
 * (No Supabase imports — safe for node:test.)
 */

export const DEFAULT_REPORT_ANCHOR = '2026-10-22';
export const DEFAULT_REPORT_WEEKDAY = 4; // Thursday (JS getDay)
export const DEFAULT_REPORT_CADENCE = 'biweekly' as const;

export type ReportCadence = 'biweekly' | 'weekly' | 'monthly';
export type ReminderStep = 'due_soon' | 'past_due' | 'overdue_3d' | 'overdue_7d';
export type DueKind = 'cadence' | 'project_event';

export type ReminderSettings = {
  reminder_enabled: boolean;
  report_cadence: ReportCadence;
  report_due_weekday: number;
  report_anchor_date: string;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  reminder_enabled: false,
  report_cadence: DEFAULT_REPORT_CADENCE,
  report_due_weekday: DEFAULT_REPORT_WEEKDAY,
  report_anchor_date: DEFAULT_REPORT_ANCHOR
};

const TZ = 'America/Los_Angeles';

export function pacificYmd(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

export function parseYmd(ymd: string): Date {
  const [y, m, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenYmd(a: string, b: string): number {
  const ms = parseYmd(b).getTime() - parseYmd(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export function cadenceStepDays(cadence: ReportCadence): number {
  if (cadence === 'weekly') return 7;
  if (cadence === 'monthly') return 28;
  return 14;
}

export function listCadenceDueDates(
  anchorYmd: string,
  cadence: ReportCadence,
  endYmd: string,
  lookbackDays = 60
): string[] {
  const step = cadenceStepDays(cadence);
  const start = addDaysYmd(endYmd, -lookbackDays);
  let cursor = anchorYmd;
  const out: string[] = [];
  let guard = 0;
  while (cursor < start && guard < 500) {
    cursor = addDaysYmd(cursor, step);
    guard += 1;
  }
  guard = 0;
  while (cursor <= endYmd && guard < 500) {
    if (cursor >= start) out.push(cursor);
    cursor = addDaysYmd(cursor, step);
    guard += 1;
  }
  return out;
}

export function dueSoonYmd(dueDate: string): string {
  return addDaysYmd(dueDate, -3);
}

export function pastDueYmd(dueDate: string): string {
  return addDaysYmd(dueDate, 1);
}

export function overdue3Ymd(dueDate: string): string {
  return addDaysYmd(dueDate, 3);
}

export function overdue7Ymd(dueDate: string): string {
  return addDaysYmd(dueDate, 7);
}

export function stepForToday(dueDate: string, todayYmd: string): ReminderStep | null {
  if (todayYmd === dueSoonYmd(dueDate)) return 'due_soon';
  if (todayYmd === pastDueYmd(dueDate)) return 'past_due';
  if (todayYmd === overdue3Ymd(dueDate)) return 'overdue_3d';
  if (todayYmd === overdue7Ymd(dueDate)) return 'overdue_7d';
  return null;
}

export function reportSatisfiesCadenceDue(
  reportYmds: string[],
  dueDate: string,
  prevDueDate: string | null
): boolean {
  const windowStart = prevDueDate
    ? addDaysYmd(prevDueDate, 1)
    : addDaysYmd(dueDate, -cadenceStepDays('biweekly'));
  return reportYmds.some((r) => r >= windowStart && r <= dueDate);
}

export function reportSatisfiesProjectDue(
  reportYmds: string[],
  eventYmd: string,
  dueDate: string
): boolean {
  return reportYmds.some((r) => r >= eventYmd && r <= dueDate);
}

export function mergeReminderSettings(
  row?: (Partial<ReminderSettings> & Record<string, unknown>) | null
): ReminderSettings {
  const cadence = String(row?.report_cadence || DEFAULT_REPORT_CADENCE);
  return {
    reminder_enabled: row?.reminder_enabled === true,
    report_cadence:
      cadence === 'weekly' || cadence === 'monthly' || cadence === 'biweekly'
        ? cadence
        : DEFAULT_REPORT_CADENCE,
    report_due_weekday:
      row?.report_due_weekday != null && Number.isFinite(Number(row.report_due_weekday))
        ? Number(row.report_due_weekday)
        : DEFAULT_REPORT_WEEKDAY,
    report_anchor_date: String(row?.report_anchor_date || DEFAULT_REPORT_ANCHOR).slice(0, 10)
  };
}

export function appOriginFallback(): string {
  return (
    process.env.DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://rmo.buildmyoffice.com'
  ).replace(/\/$/, '');
}

export function buildDueSoonEmail(input: {
  operatorName: string;
  companyName: string;
  licenseNumber: string;
  dueDate: string;
  origin?: string;
}): { subject: string; text: string } {
  const signIn = `${input.origin || appOriginFallback()}/`;
  return {
    subject: `Report due Thursday — ${input.companyName} (CSLB #${input.licenseNumber})`,
    text: [
      `Hello ${input.operatorName},`,
      '',
      `A compliance report is required this Thursday (${input.dueDate}, Pacific).`,
      `This report is required to maintain RMO compliance for ${input.companyName}, CSLB license ${input.licenseNumber}.`,
      '',
      'Please sign in and submit your structured report before end of day Thursday:',
      signIn,
      '',
      'If you have already submitted a report for this period, you can ignore this message.',
      '',
      '— RMO Compliance'
    ].join('\n')
  };
}

export function buildPastDueEmail(input: {
  operatorName: string;
  companyName: string;
  licenseNumber: string;
  dueDate: string;
  origin?: string;
}): { subject: string; text: string } {
  const signIn = `${input.origin || appOriginFallback()}/`;
  return {
    subject: `Past due — compliance report required — ${input.companyName} (CSLB #${input.licenseNumber})`,
    text: [
      `Hello ${input.operatorName},`,
      '',
      `Your required compliance report due ${input.dueDate} (Pacific) was not received.`,
      `This has been noted on the compliance record for ${input.companyName}, CSLB license ${input.licenseNumber}.`,
      '',
      'Submit the report immediately:',
      signIn,
      '',
      'Failure to report on schedule affects RMO oversight documentation.',
      '',
      '— RMO Compliance'
    ].join('\n')
  };
}

export function buildFinalNoticeText(input: {
  operatorName: string;
  operatorEmail: string;
  companyName: string;
  licenseNumber: string;
  dueDate: string;
  daysOverdue: number;
  origin?: string;
}): string {
  const signIn = `${input.origin || appOriginFallback()}/`;
  return [
    `Subject: Final notice — required compliance report overdue — ${input.companyName}`,
    '',
    `Hello ${input.operatorName},`,
    '',
    `Your required compliance report for ${input.companyName}, CSLB license ${input.licenseNumber}, was due ${input.dueDate} (Pacific) and is now ${input.daysOverdue} days overdue.`,
    '',
    'This notice is a final request to submit the report immediately. Continued non-reporting will remain on the compliance record reviewed by the Responsible Managing Officer.',
    '',
    `Please sign in and submit your report: ${signIn}`,
    '',
    `To: ${input.operatorEmail}`,
    '',
    '— RMO Compliance'
  ].join('\n');
}
