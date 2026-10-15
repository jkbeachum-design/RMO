'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';

type Alerts = {
  ntfy_server: string;
  ntfy_topic: string | null;
  has_ntfy_token: boolean;
  alert_emails: string;
  notify_new_report: boolean;
  notify_flagged: boolean;
};
type Digest = { digest_enabled: boolean; digest_hour_pt: number };
type Lic = { id: string; license_number?: string; entity_name?: string };

function hourLabel(h: number) {
  const ampm = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${ampm} PT`;
}

export default function AlertsClient({ userName }: { userName: string }) {
  const [licenseId, setLicenseId] = useState<string>('');
  const [licenses, setLicenses] = useState<Lic[]>([]);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [digest, setDigest] = useState<Digest>({ digest_enabled: true, digest_hour_pt: 7 });
  const [token, setToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (lid?: string) => {
    const res = await fetch(`/api/alerts${lid ? `?licenseId=${encodeURIComponent(lid)}` : ''}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || 'Could not load alert settings.');
      return;
    }
    setAlerts(data.alerts);
    setDigest(data.digest);
    setLicenses(data.licenses || []);
    setLicenseId(data.license_id || '');
    setEmailConfigured(Boolean(data.email_configured));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!alerts) return;
    setBusy(true);
    setStatus('');
    const res = await fetch('/api/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseId,
        digest,
        alerts: { ...alerts, ntfy_token: token || undefined, clear_ntfy_token: clearToken }
      })
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStatus(data.error || 'Save failed.');
      return;
    }
    setToken('');
    setClearToken(false);
    setStatus('Saved.');
    load(licenseId);
  }

  async function test() {
    setBusy(true);
    setStatus('Sending test…');
    const res = await fetch('/api/alerts/test', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStatus(data.error || 'Test failed.');
      return;
    }
    const push = data.push?.ok ? 'Phone push sent' : `Phone push not sent (${data.push?.skipped || data.push?.status || 'error'})`;
    const email = data.email?.ok
      ? 'email sent'
      : `email not sent (${data.email?.skipped || 'error'})`;
    setStatus(`${push}; ${email}. Save first if you just changed settings.`);
  }

  const input = 'mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base';

  return (
    <AppShell mode="RMO" name={userName}>
      <div className="mx-auto max-w-xl">
        <p className="text-sm uppercase tracking-wide text-slate-500">RMO only</p>
        <h1 className="font-serif text-3xl">Alerts</h1>
        <p className="mt-2 text-slate-600">
          Get a phone notification and email when a CEO submits a report. Phone alerts use the
          free ntfy app (same as your power-outage alerts).
        </p>

        {!alerts ? (
          <p className="mt-6 text-slate-500">{status || 'Loading…'}</p>
        ) : (
          <div className="mt-6 space-y-6">
            <section className="border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">Phone (ntfy)</h2>
              <label className="mt-3 block text-sm text-slate-700">
                Server
                <input className={input} value={alerts.ntfy_server} onChange={(e) => setAlerts({ ...alerts, ntfy_server: e.target.value })} inputMode="url" />
              </label>
              <label className="mt-3 block text-sm text-slate-700">
                Topic
                <input className={input} value={alerts.ntfy_topic || ''} onChange={(e) => setAlerts({ ...alerts, ntfy_topic: e.target.value })} autoCapitalize="off" autoCorrect="off" />
              </label>
              <label className="mt-3 block text-sm text-slate-700">
                Access token (optional)
                <input
                  className={input}
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={alerts.has_ntfy_token ? 'Saved — leave blank to keep' : 'Only if your ntfy topic is protected'}
                  autoComplete="off"
                />
              </label>
              {alerts.has_ntfy_token ? (
                <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={clearToken} onChange={(e) => setClearToken(e.target.checked)} /> Remove saved token
                </label>
              ) : null}
            </section>

            <section className="border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">Email</h2>
              <label className="mt-3 block text-sm text-slate-700">
                Alert email(s), comma-separated
                <input className={input} value={alerts.alert_emails} onChange={(e) => setAlerts({ ...alerts, alert_emails: e.target.value })} inputMode="email" placeholder="Defaults to your sign-in email" />
              </label>
              {!emailConfigured ? (
                <p className="mt-2 text-sm text-amber-700">Email sending is not set up on the server yet; phone alerts still work.</p>
              ) : null}
            </section>

            <section className="border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">What to send</h2>
              <label className="mt-3 flex items-center gap-3 text-base">
                <input type="checkbox" className="h-5 w-5" checked={alerts.notify_new_report} onChange={(e) => setAlerts({ ...alerts, notify_new_report: e.target.checked })} />
                New report submitted
              </label>
              <label className="mt-3 flex items-center gap-3 text-base">
                <input type="checkbox" className="h-5 w-5" checked={alerts.notify_flagged} onChange={(e) => setAlerts({ ...alerts, notify_flagged: e.target.checked })} />
                Reports with flags (include flag details, high priority)
              </label>
            </section>

            <section className="border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">Daily digest</h2>
              {licenses.length > 1 ? (
                <label className="mt-3 block text-sm text-slate-700">
                  Company
                  <select className={input} value={licenseId} onChange={(e) => load(e.target.value)}>
                    {licenses.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.entity_name || l.license_number}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="mt-3 flex items-center gap-3 text-base">
                <input type="checkbox" className="h-5 w-5" checked={digest.digest_enabled} onChange={(e) => setDigest({ ...digest, digest_enabled: e.target.checked })} />
                Send daily digest email
              </label>
              <label className="mt-3 block text-sm text-slate-700">
                Hour
                <select className={input} value={digest.digest_hour_pt} onChange={(e) => setDigest({ ...digest, digest_hour_pt: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" disabled={busy} onClick={save} className="bg-[#0f2a2a] px-4 py-3 font-semibold text-white disabled:opacity-50">
                Save alert settings
              </button>
              <button type="button" disabled={busy} onClick={test} className="border border-slate-300 bg-white px-4 py-3 font-semibold disabled:opacity-50">
                Send test alert
              </button>
            </div>
            {status ? <p className="text-sm text-slate-700" role="status">{status}</p> : null}
          </div>
        )}
      </div>
    </AppShell>
  );
}
