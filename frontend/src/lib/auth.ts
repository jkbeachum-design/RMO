import { cookies } from 'next/headers';
import {
  PILOT_EMAIL,
  SESSION_COOKIE
} from './constants';
import type { SessionUser, UserRole } from './types';

export { PILOT_EMAIL, PILOT_NAME, COMPLIANCE_PHONE, COMPLIANCE_PHONE_DISPLAY, SESSION_COOKIE } from './constants';

export function getPilotPassword(): string {
  return process.env.PILOT_PASSWORD || 'rmo-pilot';
}

export function createSessionToken(user: SessionUser): string {
  return Buffer.from(JSON.stringify(user), 'utf8').toString('base64url');
}

export function parseSessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as SessionUser;
    if (parsed.email !== PILOT_EMAIL) return null;
    if (parsed.mode !== 'RMO' && parsed.mode !== 'OPERATOR') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getSession(): SessionUser | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return parseSessionToken(token);
}

export function requireSession(mode?: UserRole): SessionUser {
  const session = getSession();
  if (!session) {
    throw new Error('UNAUTHORIZED');
  }
  if (mode && session.mode !== mode) {
    throw new Error('FORBIDDEN');
  }
  return session;
}
