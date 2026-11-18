/**
 * RMO-only ntfy event helpers. Never surface review flags or these pushes to CEOs.
 */
import {
  appOrigin,
  dailyDedupeKey,
  notifyRmos,
  recordFailedLoginAttempt,
  type NtfyPriority
} from './rmoAlerts';
import { getSupabaseAdmin } from './supabase';
import { addDaysYmd, pacificYmd } from './reportReminderSchedule';

const CEO_ROLES = new Set(['OPERATOR', 'FOREMAN', 'PM']);

export async function licenseIdsForCeoUser(userId: string): Promise<
  Array<{ licenseId: string; company: string; licenseNumber: string }>
> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('user_licenses')
    .select('license_id, role, licenses(id, entity_name, license_number)')
    .eq('user_id', userId)
    .in('role', ['OPERATOR', 'FOREMAN', 'PM']);
  const out: Array<{ licenseId: string; company: string; licenseNumber: string }> = [];
  const seen = new Set<string>();
  for (const row of data || []) {
    const lic = (Array.isArray(row.licenses) ? row.licenses[0] : row.licenses) as {
      id?: string;
      entity_name?: string;
      license_number?: string;
    } | null;
    const id = (lic?.id || row.license_id) as string;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      licenseId: id,
      company: lic?.entity_name || 'company',
      licenseNumber: lic?.license_number || ''
    });
  }
  return out;
}

export async function findCeoUserByEmail(email: string): Promise<{
  id: string;
  name: string;
  email: string;
  licenses: Array<{ licenseId: string; company: string; licenseNumber: string }>;
} | null> {
  const supabase = getSupabaseAdmin();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_name, user_email, is_active')
    .ilike('user_email', email.trim().toLowerCase())
    .maybeSingle();
  if (!user || user.is_active === false) return null;
  const licenses = await licenseIdsForCeoUser(user.id);
  if (!licenses.length) return null;
  return {
    id: user.id,
    name: (user.user_name || user.user_email || 'CEO').trim(),
    email: user.user_email,
    licenses
  };
}

async function pushAll(
  licenses: Array<{ licenseId: string; company: string; licenseNumber: string }>,
  msg: {
    title: string;
    message: string;
    click?: string;
    tags?: string;
    priority?: NtfyPriority;
  },
  opts: {
    kind: string;
    userId?: string | null;
    dedupeKey?: string;
    dedupeHours?: number;
  }
): Promise<void> {
  for (const lic of licenses) {
    try {
      await notifyRmos(
        lic.licenseId,
        {
          title: msg.title,
          message: msg.message,
          click: msg.click || `${appOrigin()}/dashboard/activity`,
          tags: msg.tags,
          priority: msg.priority
        },
        {
          kind: opts.kind,
          userId: opts.userId,
          dedupeKey: opts.dedupeKey
            ? opts.dedupeKey.includes(lic.licenseId)
              ? opts.dedupeKey
              : `${opts.dedupeKey}:${lic.licenseId}`
            : undefined,
          dedupeHours: opts.dedupeHours
        }
      );
    } catch (err) {
      console.warn('rmo push event failed', opts.kind, err);
    }
  }
}

/** CEO sign-in — min priority, dedupe 1/user/day. */
export async function notifyRmosOfCeoSignIn(input: {
  userId: string;
  userName: string;
  licenseId: string;
  companyName?: string;
}): Promise<void> {
  const company = input.companyName || 'company';
  await notifyRmos(
    input.licenseId,
    {
      title: `${input.userName} signed in`,
      message: `${input.userName} signed in to the CEO portal for ${company}.`,
      click: `${appOrigin()}/dashboard/activity`,
      tags: 'key',
      priority: 'min'
    },
    {
      kind: 'ceo_sign_in',
      userId: input.userId,
      dedupeKey: dailyDedupeKey(['sign_in', input.userId, input.licenseId]),
      dedupeHours: 24
    }
  );
}

/** CEO started a report — low, dedupe 1/user/day. */
export async function notifyRmosOfReportStarted(input: {
  userId: string;
  userName: string;
  licenseId: string;
  companyName?: string;
}): Promise<void> {
  const company = input.companyName || 'company';
  await notifyRmos(
    input.licenseId,
    {
      title: `${input.userName} started a report - ${company}`,
      message: `${input.userName} opened/started a compliance report for ${company}.`,
      click: `${appOrigin()}/dashboard/activity`,
      tags: 'pencil',
      priority: 'low'
    },
    {
      kind: 'report_started',
      userId: input.userId,
      dedupeKey: dailyDedupeKey(['report_started', input.userId, input.licenseId]),
      dedupeHours: 24
    }
  );
}

/** CEO vault/document upload — low, paperclip. */
export async function notifyRmosOfCeoUpload(input: {
  userId: string;
  userName: string;
  licenseId: string;
  companyName?: string;
  title?: string;
}): Promise<void> {
  const company = input.companyName || 'company';
  await notifyRmos(
    input.licenseId,
    {
      title: `Upload by ${input.userName} - ${company}`,
      message: [
        `${input.userName} uploaded a document for ${company}.`,
        input.title ? `Title: ${input.title}` : null,
        'Open Documents / Vault to review.'
      ]
        .filter(Boolean)
        .join('\n'),
      click: `${appOrigin()}/dashboard/documents`,
      tags: 'paperclip',
      priority: 'low'
    },
    {
      kind: 'ceo_upload',
      userId: input.userId
    }
  );
}

/** Project created / started / completed. */
export async function notifyRmosOfProjectChange(input: {
  licenseId: string;
  companyName?: string;
  address: string;
  action: 'created' | 'started' | 'completed';
  eventYmd?: string;
  userId?: string | null;
}): Promise<void> {
  const eventYmd = input.eventYmd || pacificYmd();
  const due = addDaysYmd(eventYmd, 3);
  const company = input.companyName || 'company';
  await notifyRmos(
    input.licenseId,
    {
      title: `Project ${input.address} ${input.action} - report due ${due}`,
      message: [
        `Project ${input.action}: ${input.address}`,
        `Company: ${company}`,
        `Report due within 3 days: ${due}.`,
        'Open Projects / Supervision for details.'
      ].join('\n'),
      click: `${appOrigin()}/dashboard/projects`,
      tags: 'house',
      priority: 'default'
    },
    {
      kind: `project_${input.action}`,
      userId: input.userId,
      dedupeKey: `project:${input.action}:${input.licenseId}:${input.address.slice(0, 80)}:${eventYmd}`
    }
  );
}

/** Failed login threshold (3 / 15m) for a CEO. */
export async function maybeNotifyFailedCeoLogin(email: string): Promise<void> {
  const count = recordFailedLoginAttempt(email);
  if (count < 3) return;
  const ceo = await findCeoUserByEmail(email);
  if (!ceo) return;
  await pushAll(
    ceo.licenses,
    {
      title: `Failed login attempts for ${ceo.name}`,
      message: `${ceo.name} (${ceo.email}) had ${count} failed sign-in attempts within 15 minutes.`,
      click: `${appOrigin()}/dashboard/activity`,
      tags: 'lock',
      priority: 'default'
    },
    {
      kind: 'failed_login',
      userId: ceo.id,
      dedupeKey: dailyDedupeKey(['failed_login', ceo.id]),
      dedupeHours: 1
    }
  );
}

/** Password reset requested for a CEO. */
export async function notifyRmosOfCeoPasswordReset(email: string): Promise<void> {
  const ceo = await findCeoUserByEmail(email);
  if (!ceo) return;
  await pushAll(
    ceo.licenses,
    {
      title: `Password reset requested for ${ceo.name}`,
      message: `${ceo.name} (${ceo.email}) requested a password reset.`,
      click: `${appOrigin()}/dashboard/activity`,
      tags: 'lock',
      priority: 'default'
    },
    {
      kind: 'password_reset',
      userId: ceo.id,
      dedupeKey: dailyDedupeKey(['password_reset', ceo.id]),
      dedupeHours: 24
    }
  );
}

/** New user joined (onboarding signup or invite). */
export async function notifyRmosOfNewUser(input: {
  licenseId: string;
  companyName: string;
  userName?: string;
  userId?: string | null;
}): Promise<void> {
  await notifyRmos(
    input.licenseId,
    {
      title: `New user joined ${input.companyName}`,
      message: [
        input.userName ? `${input.userName} joined ${input.companyName}.` : `A new user joined ${input.companyName}.`,
        'Open Team & CEOs to review membership.'
      ].join('\n'),
      click: `${appOrigin()}/dashboard/settings/team`,
      tags: 'wave',
      priority: 'default'
    },
    {
      kind: 'new_user',
      userId: input.userId,
      dedupeKey: dailyDedupeKey(['new_user', input.licenseId, input.userId || input.userName || 'unknown'])
    }
  );
}

/** Cron / digest job hard failure. */
export async function notifyRmosOfDigestFailure(errorMessage: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: members } = await supabase
    .from('user_licenses')
    .select('license_id')
    .in('role', ['RMO', 'ADMIN'])
    .limit(20);
  const licenseIds = Array.from(new Set((members || []).map((m) => m.license_id as string)));
  const target = licenseIds[0];
  if (!target) {
    console.error('Daily reminder job FAILED (no RMO license to notify):', errorMessage);
    return;
  }
  await notifyRmos(
    target,
    {
      title: 'Daily reminder job FAILED',
      message: `The daily digest / reminder job failed.\n${errorMessage.slice(0, 500)}`,
      click: `${appOrigin()}/dashboard`,
      tags: 'rotating_light',
      priority: 'high'
    },
    {
      kind: 'digest_failed',
      dedupeKey: dailyDedupeKey(['digest_failed']),
      dedupeHours: 6
    }
  );
}

/** Optional min-priority heartbeat after a successful cron run. */
export async function notifyRmosDigestHeartbeat(licenseId: string): Promise<void> {
  await notifyRmos(
    licenseId,
    {
      title: 'Daily reminder job OK',
      message: 'Daily digest / reminder job completed.',
      click: `${appOrigin()}/dashboard`,
      tags: 'white_check_mark',
      priority: 'min'
    },
    {
      kind: 'digest_heartbeat',
      dedupeKey: dailyDedupeKey(['digest_heartbeat', licenseId]),
      dedupeHours: 24
    }
  );
}

export function isCeoRole(role: string): boolean {
  return CEO_ROLES.has(String(role || '').toUpperCase());
}
