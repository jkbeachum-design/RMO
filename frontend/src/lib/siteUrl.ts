/**
 * Resolve the public app origin for Auth redirects (password reset, etc.).
 * Prefer explicit env, then request Origin / Forwarded host, then production default.
 */
export function resolveAppOrigin(input?: {
  originHeader?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  hostHeader?: string | null;
  envSiteUrl?: string | null;
  nodeEnv?: string | null;
}): string {
  const envSite = (input?.envSiteUrl || '').trim().replace(/\/$/, '');
  if (envSite) return envSite;

  const origin = (input?.originHeader || '').trim().replace(/\/$/, '');
  if (origin && /^https?:\/\//i.test(origin)) {
    // Never trust non-local origins blindly in production without allowlist —
    // but Origin is same-site for our own forgot-password form POSTs.
    if (isAllowedAppOrigin(origin)) return origin;
  }

  const host = (input?.forwardedHost || input?.hostHeader || '').split(',')[0]?.trim();
  const proto = (input?.forwardedProto || '').split(',')[0]?.trim() || 'https';
  if (host) {
    const built = `${proto}://${host}`.replace(/\/$/, '');
    if (isAllowedAppOrigin(built)) return built;
  }

  if ((input?.nodeEnv || process.env.NODE_ENV) !== 'production') {
    return 'http://localhost:3000';
  }
  return 'https://rmo.buildmyoffice.com';
}

export function isAllowedAppOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host === 'rmo.buildmyoffice.com') return true;
    // Vercel preview / custom hosts: allow if NEXT_PUBLIC_SITE_URL matched already;
    // for Origin header, only known production + localhost.
    return false;
  } catch {
    return false;
  }
}

/** Redirect target after the user clicks the reset link in email. */
export function passwordResetRedirectTo(origin: string): string {
  return `${origin.replace(/\/$/, '')}/auth/reset-password`;
}

export function passwordConfirmPath(): string {
  return '/auth/confirm';
}
