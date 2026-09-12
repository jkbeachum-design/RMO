import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  createSessionToken,
  getSession
} from '@/lib/auth';
import type { UserRole } from '@/lib/types';

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = (body.mode === 'OPERATOR' ? 'OPERATOR' : 'RMO') as UserRole;
  const next = { ...session, mode };
  const token = createSessionToken(next);

  const res = NextResponse.json({ ok: true, user: next });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14
  });
  return res;
}
