#!/usr/bin/env node
/**
 * Ops helper: create or update a Supabase Auth user and link public.users.auth_user_id.
 *
 * Usage (from repo root, with service role env loaded):
 *
 *   SUPABASE_URL=https://hiceshmpjvqfptytlyzo.supabase.co \
 *   SUPABASE_KEY=<service_role> \
 *   BOOTSTRAP_EMAIL=jbeachum@buildmyoffice.com \
 *   BOOTSTRAP_PASSWORD='<choose-a-strong-password>' \
 *   node --experimental-strip-types scripts/bootstrap-supabase-auth.mjs
 *
 * Prefer setting the password yourself (Dashboard → Authentication → Users,
 * or this script). After success, sign in at https://rmo.buildmyoffice.com
 * and unset PILOT_PASSWORD on Vercel if still present.
 *
 * Does NOT touch Eric's memberships or alert blocks.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const email = (process.env.BOOTSTRAP_EMAIL || 'jbeachum@buildmyoffice.com')
  .trim()
  .toLowerCase();
const password = process.env.BOOTSTRAP_PASSWORD;
const name = process.env.BOOTSTRAP_NAME || 'Jonathan Beachum';

if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_KEY (service_role).');
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error('Set BOOTSTRAP_PASSWORD to at least 8 characters.');
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function findAuthUserByEmail(target) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((u) => (u.email || '').toLowerCase() === target);
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
    if (page > 20) return null;
  }
}

async function main() {
  let authUserId;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name }
  });

  if (created?.user?.id) {
    authUserId = created.user.id;
    console.log('Created Auth user', authUserId);
  } else {
    const existing = await findAuthUserByEmail(email);
    if (!existing) {
      console.error('createUser failed and no existing Auth user:', createErr?.message);
      process.exit(1);
    }
    authUserId = existing.id;
    const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true
    });
    if (updErr) {
      console.error('Failed to update Auth password:', updErr.message);
      process.exit(1);
    }
    console.log('Updated Auth password for existing user', authUserId);
  }

  const { data: appUser, error: findErr } = await admin
    .from('users')
    .select('id, user_email, auth_user_id')
    .ilike('user_email', email)
    .maybeSingle();

  if (findErr) {
    console.error('users lookup failed:', findErr.message);
    process.exit(1);
  }
  if (!appUser) {
    console.error(
      `No public.users row for ${email}. Sign in once after memberships exist, or insert the user first.`
    );
    process.exit(1);
  }

  const { error: linkErr } = await admin
    .from('users')
    .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
    .eq('id', appUser.id);

  if (linkErr) {
    console.error('Failed to set auth_user_id:', linkErr.message);
    process.exit(1);
  }

  console.log(`Linked public.users ${appUser.id} → auth_user_id ${authUserId}`);
  console.log('Done. Sign in with that email/password; then remove PILOT_PASSWORD from Vercel.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
