'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RmoSignupClient() {
  const router = useRouter();
  const [confirmRmo, setConfirmRmo] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [entityName, setEntityName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ email: string; hint: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!confirmRmo) {
      setError('Select that you are the RMO to continue.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/onboarding/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm_rmo: true,
          name,
          email,
          password,
          license_number: licenseNumber,
          entity_name: entityName
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Setup failed');
      }
      setDone({
        email: data.credentials?.email || email,
        hint: data.credentials?.hint || 'Sign in with this email and password.'
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
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

      <div className="relative w-full max-w-lg border border-white/10 bg-[#0f2a2a]/90 p-8 text-white shadow-2xl backdrop-blur">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-teal-200/80">Account setup</p>
        <h1 className="font-serif text-3xl leading-none tracking-tight">RMO onboarding</h1>
        <p className="mt-3 text-sm text-teal-100/80">
          The person setting up the company account is the Responsible Managing Officer. Your RMO
          role is assigned here — not at login. After you sign in, you can invite the CEO you
          manage.
        </p>

        {done ? (
          <div className="mt-8 space-y-4">
            <div className="rounded border border-teal-400/40 bg-teal-950/40 px-4 py-3 text-sm">
              <p className="font-medium text-teal-100">RMO account created</p>
              <p className="mt-2 text-teal-100/90">
                Login email: <span className="font-mono text-white">{done.email}</span>
              </p>
              <p className="mt-1 text-teal-100/70">{done.hint}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                router.push('/dashboard/onboarding');
                router.refresh();
              }}
              className="w-full rounded bg-teal-500 px-4 py-2.5 text-sm font-semibold text-[#042f2e] hover:bg-teal-400"
            >
              Continue company onboarding
            </button>
            <p className="text-center text-xs text-teal-100/60">
              Already finished?{' '}
              <a href="/" className="underline hover:text-teal-200">
                Go to sign in
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <fieldset className="rounded border border-white/15 p-4">
              <legend className="px-1 text-xs uppercase tracking-wide text-teal-200/80">
                Your role
              </legend>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmRmo}
                  onChange={(e) => setConfirmRmo(e.target.checked)}
                  className="mt-1"
                  required
                />
                <span>
                  I am the <strong className="font-semibold text-white">RMO</strong> for this
                  company. Assign me the RMO role and dashboard access.
                </span>
              </label>
              <p className="mt-2 text-xs text-teal-100/50">
                CEOs are invited later from Roles after you sign in — they only use the CEO portal
                (/operator).
              </p>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-teal-100/70">Full name</span>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-white outline-none focus:border-teal-300"
                  autoComplete="name"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-teal-100/70">Email (login)</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-white outline-none focus:border-teal-300"
                  autoComplete="username"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-teal-100/70">Password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-white outline-none focus:border-teal-300"
                  autoComplete="new-password"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-teal-100/70">Confirm password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-white outline-none focus:border-teal-300"
                  autoComplete="new-password"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-teal-100/70">CSLB license #</span>
                <input
                  required
                  inputMode="numeric"
                  pattern="\d{4,12}"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-white outline-none focus:border-teal-300"
                  placeholder="e.g. 1234567"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-teal-100/70">Entity name</span>
                <input
                  required
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-white outline-none focus:border-teal-300"
                  placeholder="Legal company name"
                />
              </label>
            </div>

            {error ? <p className="text-sm text-amber-200">{error}</p> : null}

            <button
              type="submit"
              disabled={loading || !confirmRmo}
              className="w-full rounded bg-teal-500 px-4 py-2.5 text-sm font-semibold text-[#042f2e] hover:bg-teal-400 disabled:opacity-60"
            >
              {loading ? 'Creating RMO account…' : 'Create RMO account & company'}
            </button>

            <p className="text-center text-xs text-teal-100/60">
              Already have credentials?{' '}
              <a href="/" className="text-teal-300 underline hover:text-teal-200">
                Sign in
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
