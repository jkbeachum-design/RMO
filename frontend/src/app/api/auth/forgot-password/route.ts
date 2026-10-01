import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  createAuthPasswordClient,
  ensureSupabaseAuthUser,
  findAuthUserByEmail
} from '@/lib/supabaseAuth';
import { passwordResetRedirectTo, resolveAppOrigin } from '@/lib/siteUrl';

const GENERIC_OK =
  'If that email has an account, we sent a password reset link. Check your inbox.';

/**
 * Request a Supabase Auth password-reset email.
 * Always returns the same message (no email enumeration).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '')
    .trim()
    .toLowerCase();

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const origin = resolveAppOrigin({
    originHeader: req.headers.get('origin'),
    forwardedHost: req.headers.get('x-forwarded-host'),
    forwardedProto: req.headers.get('x-forwarded-proto'),
    hostHeader: req.headers.get('host'),
    envSiteUrl: process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL,
    nodeEnv: process.env.NODE_ENV
  });
  const redirectTo = passwordResetRedirectTo(origin);

  try {
    // If the app user exists but has no Auth account yet, provision one so
    // resetPasswordForEmail can deliver a link (covers pre-Auth pilot rows).
    const admin = getSupabaseAdmin();
    const { data: appUser } = await admin
      .from('users')
      .select('id, user_email, user_name, auth_user_id, is_active')
      .ilike('user_email', email)
      .maybeSingle();

    if (appUser && appUser.is_active !== false) {
      let authId = appUser.auth_user_id as string | null;
      if (!authId) {
        const existingAuth = await findAuthUserByEmail(email);
        if (existingAuth) {
          authId = existingAuth.id;
        } else {
          const temp = randomBytes(18).toString('base64url');
          const ensured = await ensureSupabaseAuthUser({
            email,
            password: temp,
            name: appUser.user_name || undefined
          });
          authId = ensured.authUserId;
        }
        await admin
          .from('users')
          .update({ auth_user_id: authId, updated_at: new Date().toISOString() })
          .eq('id', appUser.id);
      }
    }

    const client = createAuthPasswordClient();
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      // Log but still return generic OK — avoid leaking Auth state
      console.warn('resetPasswordForEmail:', error.message);
    }
  } catch (err) {
    console.error(
      'forgot-password failed:',
      err instanceof Error ? err.message : err
    );
  }

  return NextResponse.json({ ok: true, message: GENERIC_OK, redirectTo });
}
