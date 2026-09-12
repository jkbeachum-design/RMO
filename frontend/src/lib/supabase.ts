import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

/** Server-side client with service role — bypasses RLS for pilot dashboard reads/writes. */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_KEY');
  }

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return adminClient;
}
