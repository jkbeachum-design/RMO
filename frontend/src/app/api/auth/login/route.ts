import { NextResponse } from 'next/server';
import {
  COMPLIANCE_PHONE,
  SESSION_COOKIE,
  authenticateUser,
  createSessionToken
} from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  // Mode is derived from company memberships — never chosen at login.
  const result = await authenticateUser(email, password);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const token = createSessionToken(result.user);
  const res = NextResponse.json({
    ok: true,
    user: {
      email: result.user.email,
      name: result.user.name,
      mode: result.user.mode,
      role: result.user.role,
      licenseIds: result.user.licenseIds
    },
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
