import { createClient, type User } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase';

function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL');
  return url;
}

function anonKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY');
  return key;
}

/** Ephemeral anon client for password sign-in (does not persist cookies). */
export function createAuthPasswordClient() {
  return createClient(supabaseUrl(), anonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

/**
 * Verify email/password against Supabase Auth.
 * Returns the Auth user on success; null on invalid credentials.
 */
export async function signInWithSupabasePassword(
  email: string,
  password: string
): Promise<{ user: User } | { error: string }> {
  const client = createAuthPasswordClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  // Discard session — app uses signed rmo_session cookie, not Supabase JWT in browser.
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);

  if (error || !data.user) {
    return { error: error?.message || 'Invalid email or password' };
  }
  return { user: data.user };
}

/**
 * Create (or update password for) a Supabase Auth user via service role.
 * Used by invite / bootstrap so operators can sign in without PILOT_PASSWORD.
 */
export async function ensureSupabaseAuthUser(opts: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ authUserId: string; created: boolean }> {
  const admin = getSupabaseAdmin();
  const email = opts.email.trim().toLowerCase();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: opts.password,
    email_confirm: true,
    user_metadata: opts.name ? { full_name: opts.name } : undefined
  });

  if (data?.user?.id) {
    return { authUserId: data.user.id, created: true };
  }

  const existing = await findAuthUserByEmail(email);
  if (existing) {
    const { error: updateErr } = await admin.auth.admin.updateUserById(existing.id, {
      password: opts.password,
      email_confirm: true
    });
    if (updateErr) {
      throw new Error(updateErr.message || 'Failed to update Auth user password');
    }
    return { authUserId: existing.id, created: false };
  }

  throw new Error(error?.message || 'Failed to create Supabase Auth user');
}

/** Best-effort lookup of Auth user by email (paginated list; fine for small pilots). */
export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = getSupabaseAdmin();
  const target = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn('listUsers failed:', error.message);
      return null;
    }
    const users = data?.users || [];
    const match = users.find((u) => (u.email || '').toLowerCase() === target);
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
    if (page > 20) return null;
  }
}
