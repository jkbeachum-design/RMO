import { NextRequest, NextResponse } from 'next/server';

/**
 * Optional landing for Auth email links that point at /auth/confirm
 * (PKCE token_hash templates). Forwards params to the client reset page,
 * which establishes the recovery session in the browser.
 *
 * Prefer configuring resetPasswordForEmail redirectTo → /auth/reset-password
 * directly (see docs/AUTH.md).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const next = searchParams.get('next') || '/auth/reset-password';
  const path = next.startsWith('/') && !next.startsWith('//') ? next : '/auth/reset-password';

  const target = new URL(path, request.url);
  for (const key of ['token_hash', 'type', 'code', 'error', 'error_description']) {
    const value = searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }

  return NextResponse.redirect(target);
}
