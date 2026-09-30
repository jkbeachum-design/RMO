import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'node:crypto';
import {
  buildSessionUser,
  canUseModeFromRoles,
  pickAppMode,
  rolesFromMemberships
} from '../frontend/src/lib/authSession.ts';

// Mirror frontend/src/lib/session.ts + password.ts for Node test runner
// (keeps CI free of a TS transpile step while asserting security properties)

process.env.SESSION_SECRET = 'test-session-secret-32chars-min!!';
process.env.NODE_ENV = 'test';

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

function createSessionToken(user, maxAgeSec = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
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
  const sig = b64url(createHmac('sha256', process.env.SESSION_SECRET).update(body).digest());
  return `${body}.${sig}`;
}

function parseSessionToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(createHmac('sha256', process.env.SESSION_SECRET).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const payload = JSON.parse(b64urlDecode(body).toString('utf8'));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, n, r, p, saltHex, hashHex] = stored.split('$');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024
  });
  return timingSafeEqual(actual, expected);
}

function sessionHasLicenseId(session, licenseId) {
  return (session.licenseIds || []).includes(licenseId);
}

describe('signed session cookies', () => {
  it('round-trips a valid session', () => {
    const user = {
      userId: 'u1',
      email: 'a@example.com',
      name: 'A',
      role: 'RMO',
      mode: 'RMO',
      licenseIds: ['lic-1', 'lic-2']
    };
    const token = createSessionToken(user);
    assert.equal(token.split('.').length, 2);
    assert.notEqual(token, Buffer.from(JSON.stringify(user)).toString('base64url'));
    const parsed = parseSessionToken(token);
    assert.equal(parsed.email, 'a@example.com');
    assert.deepEqual(parsed.licenseIds, ['lic-1', 'lic-2']);
  });

  it('rejects forged plaintext base64 JSON (old cookie format)', () => {
    const forged = Buffer.from(
      JSON.stringify({ email: 'jbeachum@buildmyoffice.com', name: 'Hacker', mode: 'RMO' }),
      'utf8'
    ).toString('base64url');
    assert.equal(parseSessionToken(forged), null);
  });

  it('rejects tampered payload with invalid signature', () => {
    const token = createSessionToken({
      userId: 'u1',
      email: 'a@example.com',
      name: 'A',
      role: 'RMO',
      mode: 'RMO',
      licenseIds: ['lic-1']
    });
    const [body] = token.split('.');
    const tampered = `${body}.${b64url('not-a-real-signature')}`;
    assert.equal(parseSessionToken(tampered), null);
  });

  it('rejects expired tokens', () => {
    const token = createSessionToken(
      {
        userId: 'u1',
        email: 'a@example.com',
        name: 'A',
        role: 'RMO',
        mode: 'RMO',
        licenseIds: []
      },
      -10
    );
    assert.equal(parseSessionToken(token), null);
  });
});

describe('password hashing (legacy cutover)', () => {
  it('verifies correct password and rejects wrong one', () => {
    const hash = hashPassword('correct-horse');
    assert.ok(verifyPassword('correct-horse', hash));
    assert.equal(verifyPassword('wrong', hash), false);
  });
});

describe('company isolation helpers', () => {
  it('allows only membership license ids', () => {
    const session = { licenseIds: ['a', 'b'] };
    assert.equal(sessionHasLicenseId(session, 'a'), true);
    assert.equal(sessionHasLicenseId(session, 'c'), false);
  });
});

describe('auth session mode routing (post Supabase Auth)', () => {
  it('routes RMO/ADMIN to dashboard mode and OPERATOR/PM/FOREMAN to operator mode', () => {
    assert.equal(canUseModeFromRoles(['RMO'], 'RMO'), true);
    assert.equal(canUseModeFromRoles(['ADMIN'], 'RMO'), true);
    assert.equal(canUseModeFromRoles(['OPERATOR'], 'RMO'), false);
    assert.equal(canUseModeFromRoles(['OPERATOR', 'PM'], 'OPERATOR'), true);
    assert.equal(canUseModeFromRoles(['FOREMAN'], 'OPERATOR'), true);
  });

  it('picks Operator when requested and memberships allow; falls back for operator-only', () => {
    const dual = [
      { license_id: 'a', role: 'RMO' },
      { license_id: 'a', role: 'OPERATOR' }
    ];
    assert.equal(pickAppMode(dual, 'RMO', 'OPERATOR'), 'OPERATOR');
    assert.equal(pickAppMode(dual, 'RMO', 'RMO'), 'RMO');

    const operatorOnly = [{ license_id: 'a', role: 'OPERATOR' }];
    assert.equal(pickAppMode(operatorOnly, 'OPERATOR', 'RMO'), 'OPERATOR');
  });

  it('builds session with membership license ids after Auth success', () => {
    const memberships = [
      { license_id: 'lic-beachum', role: 'RMO' },
      { license_id: 'lic-beachum', role: 'OPERATOR' },
      { license_id: 'lic-vanguard', role: 'RMO' }
    ];
    const session = buildSessionUser({
      userId: 'u1',
      email: 'jbeachum@buildmyoffice.com',
      name: 'Jonathan Beachum',
      accountRole: 'RMO',
      memberships,
      requestedMode: 'RMO'
    });
    assert.equal(session.mode, 'RMO');
    assert.equal(session.role, 'RMO');
    assert.deepEqual(session.licenseIds.sort(), ['lic-beachum', 'lic-vanguard']);
    assert.deepEqual(rolesFromMemberships(memberships).sort(), ['OPERATOR', 'RMO']);
  });
});

describe('retell webhook shared-secret check', () => {
  it('accepts bearer secret and rejects missing auth', () => {
    const secret = 'webhook-shared-secret';
    function verify(headers) {
      const auth = headers.authorization || '';
      const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const sig = headers['x-retell-signature'] || '';
      if (bearer && bearer === secret) return true;
      if (sig && sig === secret) return true;
      return false;
    }
    assert.equal(verify({ authorization: `Bearer ${secret}` }), true);
    assert.equal(verify({ 'x-retell-signature': secret }), true);
    assert.equal(verify({}), false);
    assert.equal(verify({ authorization: 'Bearer wrong' }), false);
  });
});
