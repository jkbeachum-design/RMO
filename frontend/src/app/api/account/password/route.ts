import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { signInWithSupabasePassword } from '@/lib/supabaseAuth';
import { validateNewPassword } from '@/lib/passwordPolicy';

const attempts = new Map<string, number[]>();

/** In-app change password: verifies the current password, then sets the new one via Supabase Auth admin. */
export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const live = await refreshSessionMemberships(session);

  const now = Date.now();
  const recent = (attempts.get(live.userId) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= 5) {
    return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  }
  recent.push(now);
  attempts.set(live.userId, recent);

  const body = await req.json().catch(() => ({}));
  const current = String(body.currentPassword || '');
  const next = String(body.newPassword || '');
  if (!current) return NextResponse.json({ error: 'Enter your current password' }, { status: 400 });
  const policy = validateNewPassword(next);
  if (!policy.ok) return NextResponse.json({ error: policy.error }, { status: 400 });
  if (next === current) {
    return NextResponse.json({ error: 'New password must be different' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: me } = await supabase
    .from('users')
    .select('user_email, auth_user_id')
    .eq('id', live.userId)
    .maybeSingle();
  if (!me?.user_email || !me.auth_user_id) {
    return NextResponse.json({ error: 'Account is not linked for password changes. Use Forgot password.' }, { status: 400 });
  }

  const check = await signInWithSupabasePassword(me.user_email, current);
  if ('error' in check) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
  }
  if (check.user.id !== me.auth_user_id) {
    return NextResponse.json({ error: 'Account mismatch' }, { status: 400 });
  }

  const { error } = await supabase.auth.admin.updateUserById(me.auth_user_id, { password: next });
  if (error) {
    return NextResponse.json({ error: error.message || 'Could not change password' }, { status: 400 });
  }
  attempts.delete(live.userId);
  return NextResponse.json({ ok: true });
}
