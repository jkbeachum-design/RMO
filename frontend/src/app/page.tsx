'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const LOGIN_TIMEOUT_MS = 15000;

type LoginResponse = {
  error?: string;
  user?: { mode?: string; licenseIds?: string[] };
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== email) setEmail(cleanEmail);
    setLoading(true);
    setError('');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
    let data: LoginResponse = {};

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
        cache: 'no-store',
        signal: controller.signal
      });

      try {
        data = (await res.json()) as LoginResponse;
      } catch {
        data = {};
      }

      if (!res.ok) {
        if (res.status === 401) {
          setError(
            `${data.error || 'Invalid email or password'}. Double-check the email spelling (you typed ${cleanEmail}) and the password, then try again.`
          );
        } else {
          setError(data.error || `Sign-in failed (error ${res.status}). Please try again.`);
        }
        return;
      }
    } catch (err) {
      const aborted = (err as { name?: string })?.name === 'AbortError';
      setError(
        aborted
          ? 'Sign-in is taking too long. Check your internet connection and tap Sign in again.'
          : 'Could not reach the server. Check your internet connection and tap Sign in again.'
      );
      return;
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }

    // Lightweight sign_in activity — never blocks navigation
    try {
      const { logActivity } = await import('@/lib/activity');
      const licenseIds = (data.user?.licenseIds || []) as string[];
      void logActivity({
        event: 'sign_in',
        licenseId: licenseIds[0] || null,
        path: '/'
      });
    } catch {
      /* ignore */
    }

    setRedirecting(true);
    const dest = data.user?.mode === 'OPERATOR' ? '/operator' : '/dashboard';
    router.push(dest);
    router.refresh();
    // Fallback: if client navigation stalls (e.g. flaky mobile network), hard-navigate.
    setTimeout(() => {
      if (window.location.pathname === '/') window.location.assign(dest);
    }, 4000);
  }

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
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-teal-200/80">California CSLB</p>
        <h1 className="font-serif text-4xl leading-none tracking-tight">RMO Compliance</h1>
        <p className="mt-3 text-sm text-teal-100/80">
          Audit trail, risk flags, and monthly sign-off for Responsible Managing Officers.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-teal-100/70">Email</span>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={(e) => setEmail(e.target.value.trim().toLowerCase())}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-white outline-none focus:border-teal-300"
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-teal-100/70">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-white outline-none focus:border-teal-300"
              required
            />
          </label>

          <div className="flex justify-end">
            <a href="/forgot-password" className="text-xs text-teal-300/90 underline hover:text-teal-200">
              Forgot password?
            </a>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-amber-200">
              {error}
            </p>
          ) : null}
          {searchParams.get('reset') === '1' ? (
            <p className="text-sm text-teal-200">Password updated. Sign in with your new password.</p>
          ) : null}
          {searchParams.get('setup') === '1' ? (
            <p className="text-sm text-teal-200">
              RMO account ready. Sign in with the email and password you just created.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading || redirecting}
            className="w-full rounded bg-teal-500 px-4 py-2.5 text-sm font-semibold text-[#042f2e] hover:bg-teal-400 disabled:opacity-60"
          >
            {redirecting ? 'Opening…' : loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-xs text-teal-100/60">
          Access is by invitation. Role access comes from your company membership — you do not pick RMO or CEO at sign-in.
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f2a2a]" />}>
      <LoginForm />
    </Suspense>
  );
}
