import { NextRequest, NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isLowInvolvement, mergeComplianceSettings } from '@/lib/rules';

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
          alert_phone: (row.alert_phone as string | null) || null
        }
      : null
  );
}

async function sendEmail(to: string, subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL || 'RMO Compliance <onboarding@resend.dev>';
  if (!apiKey) {
    console.log('DIGEST email (console):', subject, '\n', text);
    return { skipped: true as const };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: [to], subject, text })
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
  const provided =
    req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || '';
  const isCron = Boolean(secret && provided === secret);

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

  for (const license of licenses || []) {
    const { data: settingsRow } = await supabase
      .from('compliance_settings')
      .select('*')
      .eq('license_id', license.id)
      .maybeSingle();
    const settings = settingsFromRow(settingsRow);
    if (!settings.digest_enabled && kind === 'MORNING') continue;

    const sinceIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: logs }, { data: activities }] = await Promise.all([
      supabase
        .from('compliance_logs')
        .select('id, flagged, created_at, rmo_reviewed')
        .eq('license_id', license.id)
        .gte('created_at', sinceIso),
      supabase
        .from('supervision_activities')
        .select('id, activity_type, occurred_at')
        .eq('license_id', license.id)
        .gte('occurred_at', sinceIso)
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

    const body = [
      `License ${license.license_number} — ${license.entity_name || 'company'}`,
      `Open flagged logs (30d): ${openFlags}`,
      `Site visits (30d): ${visits}`,
      `Decisions (30d): ${decisions}`,
      `Last involvement: ${lastTouch || 'none on record'}${days != null ? ` (${days} days)` : ''}`,
      lowInvolvement
        ? `LOW INVOLVEMENT: no visits/decisions/reviews for ${settings.low_involvement_days}+ days`
        : 'Involvement within threshold'
    ].join('\n');

    const to = settings.alert_email || process.env.RMO_ALERT_EMAIL || null;
    let deliveredEmail = false;
    if (to) {
      const emailResult = await sendEmail(
        to.split(',')[0].trim(),
        `[RMO Digest] ${license.license_number}`,
        body
      );
      deliveredEmail = Boolean(emailResult.ok);
    } else {
      console.log('DIGEST (no alert_email):', body);
    }

    await supabase.from('digest_runs').insert([
      {
        user_id: userId,
        license_id: license.id,
        kind,
        payload: { openFlags, visits, decisions, days, lowInvolvement, text: body },
        delivered_email: deliveredEmail,
        delivered_sms: false
      }
    ]);

    if (lowInvolvement) {
      const alertBody = `LOW INVOLVEMENT alert for ${license.license_number}: threshold ${settings.low_involvement_days} days.`;
      if (to) {
        await sendEmail(
          to.split(',')[0].trim(),
          `[RMO] Low involvement — ${license.license_number}`,
          alertBody
        );
      } else {
        console.log('LOW_INVOLVEMENT:', alertBody);
      }
      await supabase.from('digest_runs').insert([
        {
          user_id: userId,
          license_id: license.id,
          kind: 'LOW_INVOLVEMENT',
          payload: { days, threshold: settings.low_involvement_days },
          delivered_email: Boolean(to),
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
      lowInvolvement
    });
  }

  return NextResponse.json({ ok: true, kind, processed: results.length, results });
}
