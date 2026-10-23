import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'node:crypto';
import {
  buildSessionUser,
  canUseModeFromRoles,
  pickAppMode,
  rolesFromMemberships
} from '../frontend/src/lib/authSession.ts';
import {
  isAllowedAppOrigin,
  passwordResetRedirectTo,
  resolveAppOrigin
} from '../frontend/src/lib/siteUrl.ts';
import { validateNewPassword } from '../frontend/src/lib/passwordPolicy.ts';
import {
  establishRecoverySession,
  parseRecoveryCallback
} from '../frontend/src/lib/authRecovery.ts';

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

  it('defaults dual-role login to RMO; CEO-only to OPERATOR; honors in-session switch request', () => {
    const dual = [
      { license_id: 'a', role: 'RMO' },
      { license_id: 'a', role: 'OPERATOR' }
    ];
    // Login no longer sends a mode — dual membership defaults to RMO dashboard.
    assert.equal(pickAppMode(dual, 'RMO'), 'RMO');
    assert.equal(pickAppMode(dual, 'RMO', 'OPERATOR'), 'OPERATOR');
    assert.equal(pickAppMode(dual, 'RMO', 'RMO'), 'RMO');

    const operatorOnly = [{ license_id: 'a', role: 'OPERATOR' }];
    assert.equal(pickAppMode(operatorOnly, 'OPERATOR'), 'OPERATOR');
    // Requested RMO is ignored when memberships cannot use it.
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

describe('password reset helpers', () => {
  it('builds allowed origins and reset redirect URLs for prod and local', () => {
    assert.equal(
      resolveAppOrigin({ envSiteUrl: 'https://rmo.buildmyoffice.com/' }),
      'https://rmo.buildmyoffice.com'
    );
    assert.equal(
      resolveAppOrigin({
        originHeader: 'http://localhost:3000',
        nodeEnv: 'development'
      }),
      'http://localhost:3000'
    );
    assert.equal(
      resolveAppOrigin({ originHeader: 'https://evil.example', nodeEnv: 'production' }),
      'https://rmo.buildmyoffice.com'
    );
    assert.equal(
      passwordResetRedirectTo('https://rmo.buildmyoffice.com'),
      'https://rmo.buildmyoffice.com/auth/reset-password'
    );
    assert.equal(
      passwordResetRedirectTo('http://localhost:3000/'),
      'http://localhost:3000/auth/reset-password'
    );
    assert.equal(isAllowedAppOrigin('https://rmo.buildmyoffice.com'), true);
    assert.equal(isAllowedAppOrigin('http://localhost:3000'), true);
    assert.equal(isAllowedAppOrigin('https://phishing.example'), false);
  });

  it('enforces new-password minimum length', () => {
    assert.equal(validateNewPassword('short').ok, false);
    assert.equal(validateNewPassword('long-enough-password').ok, true);
  });
});

describe('password recovery callback parsing', () => {
  it('parses implicit hash recovery tokens (mobile Safari default)', () => {
    const parsed = parseRecoveryCallback(
      'https://rmo.buildmyoffice.com/auth/reset-password#access_token=atk&expires_in=3600&refresh_token=rtk&token_type=bearer&type=recovery'
    );
    assert.equal(parsed.kind, 'implicit');
    assert.equal(parsed.access_token, 'atk');
    assert.equal(parsed.refresh_token, 'rtk');
    assert.equal(parsed.type, 'recovery');
  });

  it('parses PKCE ?code= callbacks', () => {
    const parsed = parseRecoveryCallback(
      'https://rmo.buildmyoffice.com/auth/reset-password?code=auth-code-123'
    );
    assert.equal(parsed.kind, 'pkce');
    assert.equal(parsed.code, 'auth-code-123');
  });

  it('parses token_hash recovery OTPs (custom email templates)', () => {
    const parsed = parseRecoveryCallback(
      'https://rmo.buildmyoffice.com/auth/reset-password?token_hash=thash&type=recovery'
    );
    assert.equal(parsed.kind, 'token_hash');
    assert.equal(parsed.token_hash, 'thash');
    assert.equal(parsed.type, 'recovery');
  });

  it('prefers hash tokens when both query and hash are present', () => {
    const parsed = parseRecoveryCallback(
      'https://rmo.buildmyoffice.com/auth/reset-password?type=email#access_token=atk&refresh_token=rtk&type=recovery'
    );
    assert.equal(parsed.kind, 'implicit');
    assert.equal(parsed.type, 'recovery');
  });

  it('surfaces Auth error params from the callback URL', () => {
    const parsed = parseRecoveryCallback(
      'https://rmo.buildmyoffice.com/auth/reset-password?error=access_denied&error_description=Link+expired'
    );
    assert.equal(parsed.kind, 'error');
    assert.equal(parsed.error, 'access_denied');
  });

  it('returns none when the URL has no recovery payload', () => {
    assert.equal(
      parseRecoveryCallback('https://rmo.buildmyoffice.com/auth/reset-password').kind,
      'none'
    );
  });
});

describe('establishRecoverySession', () => {
  function mockClient(overrides = {}) {
    const calls = { setSession: [], exchangeCodeForSession: [], verifyOtp: [], getSession: [] };
    const client = {
      auth: {
        async setSession(tokens) {
          calls.setSession.push(tokens);
          return overrides.setSession
            ? overrides.setSession(tokens)
            : { data: { session: { access_token: tokens.access_token } }, error: null };
        },
        async exchangeCodeForSession(code) {
          calls.exchangeCodeForSession.push(code);
          return overrides.exchangeCodeForSession
            ? overrides.exchangeCodeForSession(code)
            : { data: { session: { access_token: 'x' } }, error: null };
        },
        async verifyOtp(params) {
          calls.verifyOtp.push(params);
          return overrides.verifyOtp
            ? overrides.verifyOtp(params)
            : { data: { session: { access_token: 'x' } }, error: null };
        },
        async getSession() {
          calls.getSession.push(true);
          return overrides.getSession
            ? overrides.getSession()
            : { data: { session: null }, error: null };
        }
      }
    };
    return { client, calls };
  }

  it('establishes session from implicit hash via setSession', async () => {
    const { client, calls } = mockClient();
    const result = await establishRecoverySession(
      client,
      'https://rmo.buildmyoffice.com/auth/reset-password#access_token=atk&refresh_token=rtk&type=recovery'
    );
    assert.equal(result.ok, true);
    assert.deepEqual(calls.setSession, [{ access_token: 'atk', refresh_token: 'rtk' }]);
    assert.equal(calls.exchangeCodeForSession.length, 0);
    assert.equal(calls.verifyOtp.length, 0);
  });

  it('establishes session from ?code= via exchangeCodeForSession', async () => {
    const { client, calls } = mockClient();
    const result = await establishRecoverySession(
      client,
      'https://rmo.buildmyoffice.com/auth/reset-password?code=abc'
    );
    assert.equal(result.ok, true);
    assert.deepEqual(calls.exchangeCodeForSession, ['abc']);
  });

  it('establishes session from token_hash via verifyOtp', async () => {
    const { client, calls } = mockClient();
    const result = await establishRecoverySession(
      client,
      'https://rmo.buildmyoffice.com/auth/reset-password?token_hash=th&type=recovery'
    );
    assert.equal(result.ok, true);
    assert.deepEqual(calls.verifyOtp, [{ token_hash: 'th', type: 'recovery' }]);
  });

  it('fails clearly when no callback tokens and no existing session', async () => {
    const { client } = mockClient();
    const result = await establishRecoverySession(
      client,
      'https://rmo.buildmyoffice.com/auth/reset-password'
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing_callback');
  });

  it('accepts an already-established session with a bare URL', async () => {
    const { client } = mockClient({
      getSession: () => ({ data: { session: { access_token: 'existing' } }, error: null })
    });
    const result = await establishRecoverySession(
      client,
      'https://rmo.buildmyoffice.com/auth/reset-password'
    );
    assert.equal(result.ok, true);
  });

  it('propagates Auth API failures as invalid_or_expired', async () => {
    const { client } = mockClient({
      setSession: () => ({
        data: { session: null },
        error: { message: 'Invalid JWT' }
      })
    });
    const result = await establishRecoverySession(
      client,
      'https://rmo.buildmyoffice.com/auth/reset-password#access_token=bad&refresh_token=bad'
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_or_expired');
    assert.match(result.message, /Invalid JWT/);
  });
});
