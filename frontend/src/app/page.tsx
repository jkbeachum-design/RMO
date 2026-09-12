'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PILOT_EMAIL } from '@/lib/constants';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') === 'operator' ? 'OPERATOR' : 'RMO';

  const [email, setEmail] = useState(PILOT_EMAIL);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'RMO' | 'OPERATOR'>(initialMode);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, mode })
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || 'Login failed');
      return;
    }

    router.push(mode === 'RMO' ? '/dashboard' : '/operator');
    router.refresh();
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
          <div className="grid grid-cols-2 gap-2 rounded border border-white/15 p-1">
            <button
              type="button"
              onClick={() => setMode('RMO')}
              className={`rounded px-3 py-2 text-sm ${
                mode === 'RMO' ? 'bg-white text-[#0f2a2a]' : 'text-teal-100 hover:bg-white/10'
              }`}
            >
              RMO Dashboard
            </button>
            <button
              type="button"
              onClick={() => setMode('OPERATOR')}
              className={`rounded px-3 py-2 text-sm ${
                mode === 'OPERATOR' ? 'bg-white text-[#0f2a2a]' : 'text-teal-100 hover:bg-white/10'
              }`}
            >
              Operator
            </button>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-teal-100/70">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              className="w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-white outline-none focus:border-teal-300"
              placeholder="Pilot password"
              required
            />
          </label>

          {error ? <p className="text-sm text-amber-200">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-teal-500 px-4 py-2.5 text-sm font-semibold text-[#042f2e] hover:bg-teal-400 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-xs text-teal-100/60">
          Pilot login: {PILOT_EMAIL}. Default password is in your <code>.env.local</code> as{' '}
          <code>PILOT_PASSWORD</code> (default <code>rmo-pilot</code>).
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
