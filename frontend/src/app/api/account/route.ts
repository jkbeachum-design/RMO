import { NextResponse } from 'next/server';
import { createSessionToken, getSession, refreshSessionMemberships, SESSION_COOKIE } from '@/lib/auth';
import { loadMemberships, membershipLicenseIds } from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Own account. RMO may edit name + phone. CEO may edit phone only (name is read-only, enforced here).
 * CEO responses include read-only "My company" info + the RMO contact for each company. No flags.
 */
function cleanPhone(v: unknown): string | null | 'invalid' {
  const raw = String(v ?? '').trim();
  if (!raw) return null;
  if (!/^[+()\d\s.-]{7,25}$/.test(raw) || raw.replace(/\D/g, '').length < 7) return 'invalid';
  return raw;
}

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const live = await refreshSessionMemberships(session);
  const supabase = getSupabaseAdmin();
  const { data: me } = await supabase
    .from('users')
    .select('user_name, user_email, phone_number')
    .eq('id', live.userId)
    .maybeSingle();

  const account = {
    name: me?.user_name || live.name,
    email: me?.user_email || live.email,
    phone: me?.phone_number || '',
    can_edit_name: live.mode === 'RMO'
  };

  if (live.mode === 'RMO') return NextResponse.json({ mode: 'RMO', account });

  const memberships = await loadMemberships(live.userId);
  const ids = membershipLicenseIds(memberships);
  const companies = [];
  if (ids.length) {
    const { data: rmoRows } = await supabase
      .from('user_licenses')
      .select('license_id, user_id')
      .in('license_id', ids)
      .eq('role', 'RMO');
    const rmoIds = Array.from(new Set((rmoRows || []).map((r) => r.user_id as string)));
    const { data: rmoUsers } = rmoIds.length
      ? await supabase.from('users').select('id, user_name, user_email, phone_number').in('id', rmoIds)
      : { data: [] as Array<{ id: string; user_name: string; user_email: string; phone_number: string | null }> };
    const seen = new Set<string>();
    for (const m of memberships) {
      if (seen.has(m.license_id)) continue;
      seen.add(m.license_id);
      const rmos = (rmoRows || [])
        .filter((r) => r.license_id === m.license_id)
        .map((r) => (rmoUsers || []).find((u) => u.id === r.user_id))
        .filter(Boolean)
        .map((u) => ({ name: u!.user_name, email: u!.user_email, phone: u!.phone_number || null }));
      companies.push({
        name: m.licenses?.entity_name || null,
        license_number: m.licenses?.license_number || null,
        rmos
      });
    }
  }
  return NextResponse.json({ mode: 'OPERATOR', account, companies });
}

export async function PUT(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const live = await refreshSessionMemberships(session);
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ('phone' in body) {
    const phone = cleanPhone(body.phone);
    if (phone === 'invalid') return NextResponse.json({ error: 'Enter a valid phone number' }, { status: 400 });
    update.phone_number = phone;
  }
  if ('name' in body) {
    if (live.mode !== 'RMO') {
      return NextResponse.json({ error: 'Your name can only be changed by your RMO' }, { status: 403 });
    }
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: 'Enter your full name' }, { status: 400 });
    }
    update.user_name = name;
  }
  const { error } = await getSupabaseAdmin().from('users').update(update).eq('id', live.userId);
  if (error) return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  const res = NextResponse.json({ ok: true, nameChanged: 'user_name' in update });
  if (typeof update.user_name === 'string') {
    // Refresh the signed session so the header shows the new name right away.
    res.cookies.set(SESSION_COOKIE, createSessionToken({ ...live, name: update.user_name }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 14
    });
  }
  return res;
}
