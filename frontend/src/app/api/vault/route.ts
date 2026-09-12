import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds, resolveAccessibleLicense } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** Document vault + expiry countdowns for membership-scoped companies. */
export async function GET(req: Request) {
  const session = getSession();
  if (!session || session.mode !== 'RMO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const live = await refreshSessionMemberships(session);
  const { searchParams } = new URL(req.url);
  const licenseNumber = searchParams.get('license_number');
  const memberships = await loadMemberships(live.userId);
  const allowedIds = membershipLicenseIds(memberships);
  if (!allowedIds.length) {
    return NextResponse.json({ items: [], licenses: [] });
  }

  let licenseIds = allowedIds;
  if (licenseNumber) {
    const resolved = await resolveAccessibleLicense(live, licenseNumber);
    if (!resolved) {
      return NextResponse.json({ error: 'License not found or access denied' }, { status: 403 });
    }
    licenseIds = [resolved.license.id];
  }

  const supabase = getSupabaseAdmin();
  const [{ data: licenses }, { data: subcontractors }] = await Promise.all([
    supabase
      .from('licenses')
      .select(
        'id, license_number, entity_name, license_expire_date, workers_comp_status'
      )
      .in('id', licenseIds)
      .order('license_number'),
    supabase
      .from('subcontractors')
      .select(
        'id, license_id, company_name, trade, coi_expiration_date, coi_verified, notes, cslb_license_number'
      )
      .in('license_id', licenseIds)
      .order('company_name')
  ]);

  const licenseById = new Map((licenses || []).map((l) => [l.id, l]));
  const items: Array<{
    kind: string;
    title: string;
    entity: string;
    license_number: string;
    expires_on: string | null;
    days_remaining: number | null;
    status: 'ok' | 'expiring' | 'expired' | 'missing';
    href?: string | null;
  }> = [];

  for (const lic of licenses || []) {
    const days = daysUntil(lic.license_expire_date);
    let status: 'ok' | 'expiring' | 'expired' | 'missing' = 'ok';
    if (days == null) status = 'missing';
    else if (days < 0) status = 'expired';
    else if (days <= 60) status = 'expiring';
    items.push({
      kind: 'LICENSE',
      title: 'CSLB license renewal',
      entity: lic.entity_name,
      license_number: lic.license_number,
      expires_on: lic.license_expire_date || null,
      days_remaining: days,
      status
    });

    items.push({
      kind: 'WORKERS_COMP',
      title: `Workers' comp status: ${lic.workers_comp_status || 'unknown'}`,
      entity: lic.entity_name,
      license_number: lic.license_number,
      expires_on: null,
      days_remaining: null,
      status: lic.workers_comp_status === 'EXEMPT' ? 'expiring' : 'ok'
    });
  }

  for (const sub of subcontractors || []) {
    const lic = licenseById.get(sub.license_id);
    const url =
      typeof sub.notes === 'string' && sub.notes.startsWith('http') ? sub.notes : null;
    const days = daysUntil(sub.coi_expiration_date);
    let status: 'ok' | 'expiring' | 'expired' | 'missing' = 'ok';
    if (!sub.coi_expiration_date && !url) status = 'missing';
    else if (days != null && days < 0) status = 'expired';
    else if (days != null && days <= 30) status = 'expiring';
    else if (!url) status = 'missing';

    items.push({
      kind: 'COI',
      title: `COI — ${sub.company_name}${sub.trade ? ` (${sub.trade})` : ''}`,
      entity: lic?.entity_name || 'Company',
      license_number: lic?.license_number || '',
      expires_on: sub.coi_expiration_date || null,
      days_remaining: days,
      status,
      href: url
    });
  }

  const rank = { expired: 0, missing: 1, expiring: 2, ok: 3 } as const;
  items.sort((a, b) => {
    const r = rank[a.status] - rank[b.status];
    if (r !== 0) return r;
    const da = a.days_remaining ?? 9999;
    const db = b.days_remaining ?? 9999;
    return da - db;
  });

  return NextResponse.json({
    items,
    licenses: licenses || [],
    summary: {
      expired: items.filter((i) => i.status === 'expired').length,
      expiring: items.filter((i) => i.status === 'expiring').length,
      missing: items.filter((i) => i.status === 'missing').length
    }
  });
}
