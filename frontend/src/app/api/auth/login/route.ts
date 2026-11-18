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
    if (result.status === 401 && email) {
      try {
        const { maybeNotifyFailedCeoLogin } = await import('@/lib/rmoPushEvents');
        await maybeNotifyFailedCeoLogin(email);
      } catch (err) {
        console.warn('failed-login RMO push skipped:', err);
      }
    }
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

  // CEO sign-in push from the auth path (activity also fires client-side).
  if (result.user.mode === 'OPERATOR' && result.user.licenseIds?.[0]) {
    try {
      const { notifyRmosOfCeoSignIn } = await import('@/lib/rmoPushEvents');
      const { getSupabaseAdmin } = await import('@/lib/supabase');
      const licenseId = result.user.licenseIds[0];
      const { data: lic } = await getSupabaseAdmin()
        .from('licenses')
        .select('entity_name')
        .eq('id', licenseId)
        .maybeSingle();
      await notifyRmosOfCeoSignIn({
        userId: result.user.userId,
        userName: result.user.name,
        licenseId,
        companyName: lic?.entity_name || undefined
      });
    } catch (err) {
      console.warn('login RMO sign-in push skipped:', err);
    }
  }

  return res;
}
