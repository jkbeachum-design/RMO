'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error || 'Could not send reset email');
      return;
    }
    setMessage(data.message || 'Check your email for a reset link.');
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
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-teal-200/80">Account recovery</p>
        <h1 className="font-serif text-3xl leading-none tracking-tight">Forgot password</h1>
        <p className="mt-3 text-sm text-teal-100/80">
          Enter your email and we will send a Supabase Auth reset link. No shared pilot password —
          this is how you recover when the password is unknown.
        </p>

        {message ? (
          <div className="mt-8 space-y-4">
            <p className="text-sm text-teal-100">{message}</p>
            <Link href="/" className="inline-block text-sm text-teal-300 underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block text-teal-100/70">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-white outline-none focus:border-teal-300"
                required
              />
            </label>
            {error ? <p className="text-sm text-amber-200">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-teal-500 px-4 py-2.5 text-sm font-semibold text-[#042f2e] hover:bg-teal-400 disabled:opacity-60"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <Link href="/" className="block text-center text-sm text-teal-100/70 underline">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
