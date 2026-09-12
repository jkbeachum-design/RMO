import { createHmac, timingSafeEqual } from 'crypto';
import type { SessionUser, UserRole } from './types';

const SESSION_VERSION = 1;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  // Dev-only fallback — production MUST set SESSION_SECRET
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set (min 16 chars) in production');
  }
  return process.env.PILOT_PASSWORD
    ? `dev-session-${process.env.PILOT_PASSWORD}`
    : 'dev-only-insecure-session-secret';
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

export type SessionPayload = SessionUser & {
  v: number;
  iat: number;
  exp: number;
};

/** Create a forge-resistant HMAC-signed session token (not plaintext JSON). */
export function createSessionToken(user: SessionUser, maxAgeSec = 60 * 60 * 24 * 14): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: SESSION_VERSION,
    userId: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    mode: user.mode,
    licenseIds: user.licenseIds || [],
    iat: now,
    exp: now + maxAgeSec
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac('sha256', getSessionSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function parseSessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  try {
    const expected = b64url(createHmac('sha256', getSessionSecret()).update(body).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(b64urlDecode(body).toString('utf8')) as SessionPayload;
    if (payload.v !== SESSION_VERSION) return null;
    if (!payload.userId || !payload.email) return null;
    if (payload.mode !== 'RMO' && payload.mode !== 'OPERATOR') return null;
    if (payload.role !== 'RMO' && payload.role !== 'OPERATOR' && payload.role !== 'ADMIN' && payload.role !== 'PM' && payload.role !== 'FOREMAN') {
      return null;
    }
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
      role: payload.role as UserRole,
      mode: payload.mode,
      licenseIds: Array.isArray(payload.licenseIds) ? payload.licenseIds : []
    };
  } catch {
    return null;
  }
}

export function isValidRole(value: unknown): value is UserRole {
  return value === 'RMO' || value === 'OPERATOR' || value === 'ADMIN' || value === 'PM' || value === 'FOREMAN';
}
