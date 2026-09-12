import { NextResponse } from 'next/server';
import {
  COMPLIANCE_PHONE,
  PILOT_EMAIL,
  PILOT_NAME,
  SESSION_COOKIE,
  createSessionToken,
  getPilotPassword
} from '@/lib/auth';
import type { UserRole } from '@/lib/types';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const mode = (body.mode === 'OPERATOR' ? 'OPERATOR' : 'RMO') as UserRole;

  if (email !== PILOT_EMAIL || password !== getPilotPassword()) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const token = createSessionToken({
    email: PILOT_EMAIL,
    name: PILOT_NAME,
    mode
  });

  const res = NextResponse.json({
    ok: true,
    user: { email: PILOT_EMAIL, name: PILOT_NAME, mode },
    compliancePhone: COMPLIANCE_PHONE
  });

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 14
  });

  return res;
}
