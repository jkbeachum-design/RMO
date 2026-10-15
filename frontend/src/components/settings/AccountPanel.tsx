'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Account = { name: string; email: string; phone: string; can_edit_name: boolean };

const input = 'mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base';

export default function AccountPanel() {
  const router = useRouter();
  const [acct, setAcct] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  useEffect(() => {
    fetch('/api/account')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.account) {
          setMsg('Could not load your account. Check your connection and try again.');
          return;
        }
        setAcct(d.account);
        setName(d.account.name || '');
        setPhone(d.account.phone || '');
      })
      .catch(() => setMsg('Could not load your account. Check your connection.'));
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!acct) return;
    setBusy(true);
    setMsg('');
    const body: Record<string, string> = { phone };
    if (acct.can_edit_name) body.name = name;
    const res = await fetch('/api/account', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? 'Saved.' : d.error || 'Could not save.');
    if (res.ok && d.nameChanged) router.refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg('');
    if (pw1 !== pw2) {
      setPwMsg('New passwords do not match.');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: cur, newPassword: pw1 })
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setCur('');
      setPw1('');
      setPw2('');
      setPwMsg('Password changed. Use the new password next time you sign in.');
    } else setPwMsg(d.error || 'Could not change password.');
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  if (!acct) return <p className="text-sm text-slate-500">{msg || 'Loading…'}</p>;

  return (
    <div className="space-y-6">
      <form onSubmit={saveProfile} className="border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Profile</h2>
        <label className="mt-3 block text-sm text-slate-700">
          Name
          {acct.can_edit_name ? (
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          ) : (
            <>
              <input className={`${input} bg-slate-50 text-slate-600`} value={name} readOnly aria-readonly="true" />
              <span className="mt-1 block text-xs text-slate-500">Ask your RMO if your name needs to change.</span>
            </>
          )}
        </label>
        <label className="mt-3 block text-sm text-slate-700">
          Email (sign-in)
          <input className={`${input} bg-slate-50 text-slate-600`} value={acct.email} readOnly aria-readonly="true" />
        </label>
        <label className="mt-3 block text-sm text-slate-700">
          Phone
          <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="(916) 555-0123" />
        </label>
        <button type="submit" disabled={busy} className="mt-4 w-full bg-[#0f2a2a] px-4 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto">
          Save profile
        </button>
        {msg ? <p className="mt-2 text-sm text-slate-700" role="status">{msg}</p> : null}
      </form>

      <form onSubmit={changePassword} className="border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Change password</h2>
        <label className="mt-3 block text-sm text-slate-700">
          Current password
          <input className={input} type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="mt-3 block text-sm text-slate-700">
          New password (8+ characters)
          <input className={input} type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        <label className="mt-3 block text-sm text-slate-700">
          Confirm new password
          <input className={input} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" minLength={8} required />
        </label>
        <button type="submit" disabled={busy} className="mt-4 w-full bg-[#0f2a2a] px-4 py-3 font-semibold text-white disabled:opacity-50 sm:w-auto">
          Change password
        </button>
        {pwMsg ? <p className="mt-2 text-sm text-slate-700" role="status">{pwMsg}</p> : null}
      </form>

      <button type="button" onClick={logout} className="w-full border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-900 sm:w-auto">
        Log out
      </button>
    </div>
  );
}
