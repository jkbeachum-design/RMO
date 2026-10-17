import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import {
  canManageLicenseTeam,
  loadMemberships,
  resolveAccessibleLicense,
  rolesOnLicense
} from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  isActivityEventType,
  reportActivityStatus,
  shortUserAgent,
  type ActivityEventType
} from '@/lib/activity';
import { daysSince, mergeComplianceSettings } from '@/lib/rules';

const OPERATOR_ROLES = new Set(['OPERATOR', 'FOREMAN', 'PM']);

/**
 * POST — operators log their own activity (also used by offline flush).
 * Never used by RMO dashboard for writing other users' rows.
 */
export async function POST(req: Request) {
  try {
    const session = getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const live = await refreshSessionMemberships(session);
    const body = await req.json().catch(() => ({}));
    const eventRaw = body.event;
    if (!isActivityEventType(eventRaw)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }
    const event = eventRaw as ActivityEventType;

    const licenseHint =
      (typeof body.licenseNumber === 'string' && body.licenseNumber.trim()) ||
      (typeof body.licenseId === 'string' && body.licenseId.trim()) ||
      null;

    let licenseUuid: string | null = null;

    if (licenseHint) {
      // Accept either UUID or CSLB license number
      const byNumber = await resolveAccessibleLicense(live, licenseHint);
      if (byNumber) {
        licenseUuid = byNumber.license.id;
      } else if (live.licenseIds.includes(licenseHint)) {
        licenseUuid = licenseHint;
      }
    }

    if (!licenseUuid && live.licenseIds[0]) {
      licenseUuid = live.licenseIds[0];
    }

    if (!licenseUuid) {
      return NextResponse.json({ error: 'No accessible license' }, { status: 403 });
    }

    // Must belong to the license (any role — CEO portal users).
    if (!live.licenseIds.includes(licenseUuid)) {
      return NextResponse.json({ error: 'License access denied' }, { status: 403 });
    }

    let createdAt = new Date().toISOString();
    if (typeof body.createdAt === 'string' && body.createdAt.trim()) {
      const parsed = new Date(body.createdAt);
      if (!Number.isNaN(parsed.getTime())) {
        // Cap clock skew: allow up to 7 days in the past (offline), not future > 5m
        const now = Date.now();
        const t = parsed.getTime();
        if (t <= now + 5 * 60 * 1000 && t >= now - 7 * 24 * 60 * 60 * 1000) {
          createdAt = parsed.toISOString();
        }
      }
    }

    const path =
      typeof body.path === 'string' ? String(body.path).slice(0, 500) || null : null;
    const userAgent = shortUserAgent(
      typeof body.userAgent === 'string' ? body.userAgent : req.headers.get('user-agent')
    );

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('activity_events').insert([
      {
        user_id: live.userId,
        license_id: licenseUuid,
        event,
        path,
        user_agent: userAgent,
        created_at: createdAt
      }
    ]);

    if (error) {
      console.warn('activity_events insert failed:', error.message);
      return NextResponse.json(
        {
          error: error.message,
          hint: 'Apply supabase/migrations/013_activity_events.sql if table is missing'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn('activity POST failed:', err);
    // Soft-fail so offline/UI clients are never broken by logging
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

/**
 * GET — RMO/ADMIN activity overview for a license (operators + recent events).
 */
export async function GET(req: Request) {
  const session = getSession();
  if (!session || session.mode !== 'RMO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const { searchParams } = new URL(req.url);
  const resolved = await resolveAccessibleLicense(live, searchParams.get('license_number'));
  if (!resolved) {
    return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
  }

  const memberships = await loadMemberships(live.userId);
  if (!canManageLicenseTeam(memberships, resolved.license.id)) {
    // Session is RMO mode, but require RMO/ADMIN on this specific license
    const roles = rolesOnLicense(memberships, resolved.license.id);
    if (!roles.includes('RMO') && !roles.includes('ADMIN')) {
      return NextResponse.json({ error: 'RMO/ADMIN required for activity' }, { status: 403 });
    }
  }

  const supabase = getSupabaseAdmin();
  const licenseId = resolved.license.id;

  const [{ data: settingsRow }, { data: memberRows, error: memberErr }, { data: recent, error: recentErr }] =
    await Promise.all([
      supabase.from('compliance_settings').select('*').eq('license_id', licenseId).maybeSingle(),
      supabase
        .from('user_licenses')
        .select('user_id, role, users(id, user_name, user_email, auth_user_id)')
        .eq('license_id', licenseId),
      supabase
        .from('activity_events')
        .select('id, user_id, event, path, created_at, users(user_name, user_email)')
        .eq('license_id', licenseId)
        .order('created_at', { ascending: false })
        .limit(40)
    ]);

  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }
  if (recentErr) {
    return NextResponse.json(
      {
        error: recentErr.message,
        hint: 'Apply supabase/migrations/013_activity_events.sql if table is missing'
      },
      { status: 500 }
    );
  }

  const settings = mergeComplianceSettings(
    settingsRow
      ? {
          low_involvement_days: Number(settingsRow.low_involvement_days)
        }
      : null
  );

  // Unique operator-side members (CEO / PM / Foreman)
  type MemberUser = {
    id: string;
    user_name: string | null;
    user_email: string | null;
    auth_user_id: string | null;
  };

  const operatorsMap = new Map<
    string,
    { id: string; name: string; email: string; authUserId: string | null; roles: string[] }
  >();

  for (const row of memberRows || []) {
    const role = String(row.role || '').toUpperCase();
    if (!OPERATOR_ROLES.has(role)) continue;
    const u = (Array.isArray(row.users) ? row.users[0] : row.users) as MemberUser | null;
    if (!u?.id) continue;
    const existing = operatorsMap.get(u.id);
    if (existing) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
      continue;
    }
    operatorsMap.set(u.id, {
      id: u.id,
      name: u.user_name || u.user_email || 'Operator',
      email: u.user_email || '',
      authUserId: u.auth_user_id || null,
      roles: [role]
    });
  }

  const operators = Array.from(operatorsMap.values());
  const operatorIds = operators.map((o) => o.id);

  // Activity rows for opens / sign-ins / report_submitted
  let activityRows: Array<{ user_id: string; event: string; created_at: string }> = [];
  if (operatorIds.length) {
    const { data } = await supabase
      .from('activity_events')
      .select('user_id, event, created_at')
      .eq('license_id', licenseId)
      .in('user_id', operatorIds)
      .in('event', ['app_open', 'page_view', 'sign_in', 'report_submitted'])
      .order('created_at', { ascending: false })
      .limit(800);
    activityRows = data || [];
  }

  // License compliance logs — match operator_name when possible for last report.
  const { data: logs } = await supabase
    .from('compliance_logs')
    .select('id, created_at, extracted_data')
    .eq('license_id', licenseId)
    .order('created_at', { ascending: false })
    .limit(200);

  const licenseLastReport = logs?.[0]?.created_at || null;

  const lastOpenByUser = new Map<string, string>();
  const lastSignInEventByUser = new Map<string, string>();
  const lastSubmittedByUser = new Map<string, string>();
  for (const row of activityRows) {
    if (
      (row.event === 'app_open' || row.event === 'page_view') &&
      !lastOpenByUser.has(row.user_id)
    ) {
      lastOpenByUser.set(row.user_id, row.created_at);
    }
    if (row.event === 'sign_in' && !lastSignInEventByUser.has(row.user_id)) {
      lastSignInEventByUser.set(row.user_id, row.created_at);
    }
    if (row.event === 'report_submitted' && !lastSubmittedByUser.has(row.user_id)) {
      lastSubmittedByUser.set(row.user_id, row.created_at);
    }
  }

  // auth.users.last_sign_in_at via service role
  const lastSignInAuth = new Map<string, string | null>();
  await Promise.all(
    operators.map(async (op) => {
      if (!op.authUserId) {
        lastSignInAuth.set(op.id, null);
        return;
      }
      try {
        const { data, error } = await supabase.auth.admin.getUserById(op.authUserId);
        if (error || !data?.user) {
          lastSignInAuth.set(op.id, null);
          return;
        }
        lastSignInAuth.set(op.id, data.user.last_sign_in_at || null);
      } catch {
        lastSignInAuth.set(op.id, null);
      }
    })
  );

  function lastReportForOperator(op: { id: string; name: string }): string | null {
    const fromActivity = lastSubmittedByUser.get(op.id);
    if (fromActivity) return fromActivity;
    const name = op.name.trim().toLowerCase();
    for (const log of logs || []) {
      const extracted = (log.extracted_data || {}) as { operator_name?: string };
      const opName = String(extracted.operator_name || '')
        .trim()
        .toLowerCase();
      if (opName && name && opName === name) return log.created_at;
    }
    return null;
  }

  const now = new Date();
  const operatorSummaries = operators.map((op) => {
    const lastOpen = lastOpenByUser.get(op.id) || null;
    const lastSignIn =
      lastSignInAuth.get(op.id) || lastSignInEventByUser.get(op.id) || null;
    const lastReport = lastReportForOperator(op);
    const days = daysSince(lastReport, now);
    const status = reportActivityStatus(days, settings.low_involvement_days);
    return {
      userId: op.id,
      name: op.name,
      email: op.email,
      roles: op.roles,
      lastOpen,
      lastSignIn,
      lastReport,
      daysSinceReport: days,
      status,
      thresholds: {
        amber: Math.max(1, Math.floor(settings.low_involvement_days / 2)),
        red: settings.low_involvement_days
      }
    };
  });

  operatorSummaries.sort((a, b) => {
    const order = { red: 0, amber: 1, green: 2 };
    return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
  });

  const recentEvents = (recent || []).map((row) => {
    const u = (Array.isArray(row.users) ? row.users[0] : row.users) as {
      user_name?: string;
      user_email?: string;
    } | null;
    return {
      id: row.id,
      userId: row.user_id,
      event: row.event,
      path: row.path,
      createdAt: row.created_at,
      userName: u?.user_name || u?.user_email || 'User'
    };
  });

  return NextResponse.json({
    license: {
      id: resolved.license.id,
      license_number: resolved.license.license_number,
      entity_name: resolved.license.entity_name
    },
    lowInvolvementDays: settings.low_involvement_days,
    operators: operatorSummaries,
    recentEvents,
    licenseLastReport
  });
}
