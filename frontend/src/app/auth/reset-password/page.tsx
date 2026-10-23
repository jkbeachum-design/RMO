'use client';

import { FormEvent, Suspense, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { establishRecoverySession } from '@/lib/authRecovery';
import { validateNewPassword } from '@/lib/passwordPolicy';

/**
 * Browser Auth client for password recovery only.
 * Must NOT use flowType:'pkce' with detectSessionInUrl — server-sent recovery
 * emails use the implicit hash, and auth-js rejects that combination.
 * We parse callbacks ourselves via establishRecoverySession.
 */
function browserAuthClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'implicit'
    }
  });
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'done' | 'invalid'>('loading');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (searchParams.get('error') === 'invalid_or_expired') {
        if (!cancelled) setStatus('invalid');
        return;
      }

      try {
        const supabase = browserAuthClient();
        // Prefer full href so hash fragments (#access_token=…) are included —
        // useSearchParams() only sees the query string.
        const href =
          typeof window !== 'undefined' ? window.location.href : `http://local.invalid/?${searchParams.toString()}`;
        const result = await establishRecoverySession(supabase, href);
        if (cancelled) return;
        if (!result.ok) {
          setError(result.message);
          setStatus('invalid');
          return;
        }
        // Drop tokens / codes from the address bar so they are not left in history.
        if (typeof window !== 'undefined') {
          window.history.replaceState(window.history.state, '', window.location.pathname);
        }
        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not start password reset');
          setStatus('invalid');
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const check = validateNewPassword(password);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const supabase = browserAuthClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'Failed to update password');
        setSaving(false);
        return;
      }
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      setStatus('done');
      setSaving(false);
      setTimeout(() => router.push('/?reset=1'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
      setSaving(false);
    }
  }

  return (
    <AuthCard>
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-teal-200/80">Account recovery</p>
      <h1 className="font-serif text-3xl leading-none tracking-tight">Set a new password</h1>
      <p className="mt-3 text-sm text-teal-100/80">
        After saving, sign in normally. Your RMO / CEO access is unchanged.
      </p>

      {status === 'loading' ? (
        <p className="mt-8 text-sm text-teal-100/70">Validating reset link…</p>
      ) : null}

      {status === 'invalid' ? (
        <div className="mt-8 space-y-4">
          <p className="text-sm text-amber-200">{error || 'Reset link is not valid.'}</p>
          <Link href="/forgot-password" className="inline-block text-sm text-teal-300 underline">
            Request a new reset email
          </Link>
          <div>
            <Link href="/" className="text-sm text-teal-100/70 underline">
              Back to sign in
            </Link>
          </div>
        </div>
      ) : null}

      {status === 'done' ? (
        <p className="mt-8 text-sm text-teal-100">Password updated. Redirecting to sign in…</p>
      ) : null}

      {status === 'ready' ? (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-teal-100/70">New password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              className="w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-white outline-none focus:border-teal-300"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-teal-100/70">Confirm password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              className="w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-white outline-none focus:border-teal-300"
              required
            />
          </label>
          {error ? <p className="text-sm text-amber-200">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded bg-teal-500 px-4 py-2.5 text-sm font-semibold text-[#042f2e] hover:bg-teal-400 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save password'}
          </button>
        </form>
      ) : null}
    </AuthCard>
  );
}

function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 20% 20%, #1a4a4a 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #0d3330 0%, transparent 45%), linear-gradient(160deg, #0a1f1f 0%, #143636 50%, #0f2a2a 100%)'
        }}
      />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }}
      />
      <div className="relative w-full max-w-md border border-white/10 bg-[#0f2a2a]/90 p-8 text-white shadow-2xl backdrop-blur">
        {children}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f2a2a]" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
