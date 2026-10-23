/**
 * Password-recovery callback handling for /auth/reset-password.
 *
 * Server-initiated resetPasswordForEmail uses the implicit grant (no PKCE
 * code verifier in the browser). Email links may still arrive as:
 *   - #access_token=...&refresh_token=...&type=recovery  (implicit)
 *   - ?code=...                                         (PKCE — only if a verifier exists)
 *   - ?token_hash=...&type=recovery                     (OTP / custom templates)
 *
 * Never configure the browser client with flowType:'pkce' + detectSessionInUrl
 * alone: auth-js rejects implicit hash callbacks as "Not a valid PKCE flow url."
 */

export type RecoveryCallbackKind =
  | 'implicit'
  | 'pkce'
  | 'token_hash'
  | 'error'
  | 'none';

export type ParsedRecoveryCallback = {
  kind: RecoveryCallbackKind;
  access_token?: string;
  refresh_token?: string;
  expires_in?: string;
  expires_at?: string;
  token_type?: string;
  code?: string;
  token_hash?: string;
  type?: string;
  error?: string;
  error_description?: string;
};

const RECOVERY_OTP_TYPES = new Set([
  'recovery',
  'email',
  'signup',
  'invite',
  'magiclink',
  'email_change'
]);

/** Merge query + hash params (hash wins on key collision — Auth puts tokens there). */
export function parseAuthCallbackParams(
  href: string
): Record<string, string> {
  const params: Record<string, string> = {};
  try {
    const url = new URL(href);
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    if (hash) {
      new URLSearchParams(hash).forEach((value, key) => {
        params[key] = value;
      });
    }
  } catch {
    // ignore malformed URLs
  }
  return params;
}

export function parseRecoveryCallback(href: string): ParsedRecoveryCallback {
  const p = parseAuthCallbackParams(href);

  if (p.error || p.error_description || p.error_code) {
    return {
      kind: 'error',
      error: p.error || p.error_code || 'error',
      error_description: p.error_description
    };
  }

  if (p.access_token && p.refresh_token) {
    return {
      kind: 'implicit',
      access_token: p.access_token,
      refresh_token: p.refresh_token,
      expires_in: p.expires_in,
      expires_at: p.expires_at,
      token_type: p.token_type || 'bearer',
      type: p.type
    };
  }

  if (p.code) {
    return { kind: 'pkce', code: p.code, type: p.type };
  }

  if (p.token_hash && p.type && RECOVERY_OTP_TYPES.has(p.type)) {
    return {
      kind: 'token_hash',
      token_hash: p.token_hash,
      type: p.type
    };
  }

  return { kind: 'none' };
}

/** Minimal surface we need from a Supabase auth client. */
export type RecoveryAuthClient = {
  auth: {
    setSession: (tokens: {
      access_token: string;
      refresh_token: string;
    }) => Promise<{ data: { session: unknown }; error: { message: string } | null }>;
    exchangeCodeForSession: (
      code: string
    ) => Promise<{ data: { session: unknown }; error: { message: string } | null }>;
    verifyOtp: (params: {
      token_hash: string;
      type:
        | 'recovery'
        | 'email'
        | 'signup'
        | 'invite'
        | 'magiclink'
        | 'email_change';
    }) => Promise<{ data: { session: unknown }; error: { message: string } | null }>;
    getSession: () => Promise<{
      data: { session: unknown };
      error: { message: string } | null;
    }>;
  };
};

export type EstablishRecoveryResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_or_expired' | 'missing_callback' | 'error'; message: string };

/**
 * Establish a recovery session from the current (or given) callback URL.
 * Call with detectSessionInUrl:false so we own all three callback shapes.
 */
export async function establishRecoverySession(
  client: RecoveryAuthClient,
  href: string
): Promise<EstablishRecoveryResult> {
  const parsed = parseRecoveryCallback(href);

  if (parsed.kind === 'error') {
    return {
      ok: false,
      reason: 'invalid_or_expired',
      message:
        parsed.error_description ||
        'This reset link is invalid or has expired. Request a new one.'
    };
  }

  if (parsed.kind === 'implicit') {
    const { error } = await client.auth.setSession({
      access_token: parsed.access_token!,
      refresh_token: parsed.refresh_token!
    });
    if (error) {
      return {
        ok: false,
        reason: 'invalid_or_expired',
        message: error.message || 'This reset link is invalid or has expired. Request a new one.'
      };
    }
    return { ok: true };
  }

  if (parsed.kind === 'pkce') {
    const { error } = await client.auth.exchangeCodeForSession(parsed.code!);
    if (error) {
      return {
        ok: false,
        reason: 'invalid_or_expired',
        message:
          error.message ||
          'This reset link is invalid or has expired. Request a new one.'
      };
    }
    return { ok: true };
  }

  if (parsed.kind === 'token_hash') {
    const { error } = await client.auth.verifyOtp({
      token_hash: parsed.token_hash!,
      type: parsed.type as
        | 'recovery'
        | 'email'
        | 'signup'
        | 'invite'
        | 'magiclink'
        | 'email_change'
    });
    if (error) {
      return {
        ok: false,
        reason: 'invalid_or_expired',
        message:
          error.message ||
          'This reset link is invalid or has expired. Request a new one.'
      };
    }
    return { ok: true };
  }

  // No URL tokens — accept an already-established recovery session (e.g. soft nav).
  const { data } = await client.auth.getSession();
  if (data.session) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: 'missing_callback',
    message: 'Open the link from your email to set a new password.'
  };
}
