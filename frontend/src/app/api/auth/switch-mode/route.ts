import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  createSessionToken,
  getSession,
  refreshSessionMemberships
} from '@/lib/auth';
import { canUseMode, loadMemberships } from '@/lib/access';
import type { AppMode } from '@/lib/types';

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = (body.mode === 'OPERATOR' ? 'OPERATOR' : 'RMO') as AppMode;

  const memberships = await loadMemberships(session.userId);
  if (!canUseMode(memberships, mode)) {
    return NextResponse.json(
      { error: `Your account has no ${mode} membership on any company` },
      { status: 403 }
    );
  }

  const refreshed = await refreshSessionMemberships({ ...session, mode });
  const token = createSessionToken(refreshed);

  const res = NextResponse.json({ ok: true, user: refreshed });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14
  });
  return res;
}
