import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

/**
 * Server-only Supabase client using the service role key.
 *
 * NEVER import this into client components. NEVER expose SUPABASE_KEY as NEXT_PUBLIC_*.
 * Use only for:
 *   - Trusted jobs (Retell webhook on Express, cron, bootstrap)
 *   - Dashboard/API paths that have ALREADY authenticated the user and will
 *     filter by user_licenses membership (see lib/access.ts)
 *
 * Once supabase/migrations/001_auth_company_isolation.sql is applied, prefer
 * user-scoped clients with RLS for new code paths. Service role bypasses RLS.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_KEY');
  }

  if (typeof window !== 'undefined') {
    throw new Error('getSupabaseAdmin() must not run in the browser');
  }

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return adminClient;
}

/** Browser / anon client (no service role). For future Supabase Auth session use. */
export function getSupabaseAnon(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}
