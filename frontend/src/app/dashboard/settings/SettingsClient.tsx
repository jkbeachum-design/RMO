'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import {
  DEFAULT_COMPLIANCE_SETTINGS,
  type ComplianceSettings
} from '@/lib/rules';

type LicenseOption = {
  id: string;
  license_number?: string;
  entity_name?: string;
};

export default function SettingsClient({ userName }: { userName: string }) {
  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [licenseId, setLicenseId] = useState('');
  const [settings, setSettings] = useState<ComplianceSettings>({
    ...DEFAULT_COMPLIANCE_SETTINGS
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [hint, setHint] = useState('');

  const load = useCallback(async (id?: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = id ? `?licenseId=${encodeURIComponent(id)}` : '';
      const res = await fetch(`/api/settings${qs}`);
      const data = await res.json();
      if (!res.ok && !data.settings) throw new Error(data.error || 'Failed to load settings');
      setLicenses(data.licenses || []);
      setLicenseId(data.license_id || id || '');
      setSettings(data.settings || DEFAULT_COMPLIANCE_SETTINGS);
      setHint(data.migration_required ? data.hint || '' : '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!licenseId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId, settings })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.hint || 'Save failed');
      setSettings(data.settings);
      setMessage('Settings saved. Rule engine and digests use these values on the next run.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function runDigestNow() {
    setRunning(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/jobs/digests', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Digest failed');
      setMessage(
        `Digest ran for ${data.processed} company(ies). Check console/email; low-involvement alerts fire when stale.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Digest failed');
    } finally {
      setRunning(false);
    }
  }

  function setNum<K extends keyof ComplianceSettings>(key: K, value: string) {
    const n = Number(value);
    setSettings((s) => ({ ...s, [key]: Number.isFinite(n) ? n : s[key] }));
  }

  function setBool<K extends keyof ComplianceSettings>(key: K, value: boolean) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  return (
    <AppShell mode="RMO" name={userName}>
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <header>
          <h1 className="font-serif text-3xl text-slate-900">Rules & digests</h1>
          <p className="mt-2 text-sm text-slate-600">
            Per-company thresholds for the compliance rule engine, plus morning digest and
            low-involvement alerts when there are no visits, decisions, or reviews for N days.
          </p>
        </header>

        {hint ? (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-900">
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-slate-600">Company</span>
            <select
              className="mt-1 block w-64 rounded border border-slate-300 px-3 py-2"
              value={licenseId}
              onChange={(e) => {
                setLicenseId(e.target.value);
                void load(e.target.value);
              }}
            >
              {licenses.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.license_number} — {l.entity_name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void runDigestNow()}
            disabled={running || loading}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {running ? 'Running…' : 'Run digest now'}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <form onSubmit={onSave} className="space-y-8">
            <section className="space-y-4">
              <h2 className="font-serif text-xl text-slate-900">Rule thresholds</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  Contract value threshold ($)
                  <input
                    type="number"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    value={settings.contract_value_threshold}
                    onChange={(e) => setNum('contract_value_threshold', e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Permit required above ($)
                  <input
                    type="number"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    value={settings.permit_required_above}
                    onChange={(e) => setNum('permit_required_above', e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Min trades for B-General scope
                  <input
                    type="number"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    value={settings.min_trades_for_b_general}
                    onChange={(e) => setNum('min_trades_for_b_general', e.target.value)}
                  />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ['flag_workers_comp_exempt_crew', 'Workers’ comp exempt + hired crew'],
                    ['flag_unverified_subs', 'Unverified subcontractors'],
                    ['flag_expired_coi', 'Expired COI'],
                    ['flag_scope_mismatch', 'B-General scope mismatch'],
                    ['flag_missing_permit', 'Missing permit above threshold']
                  ] as Array<[keyof ComplianceSettings, string]>
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(settings[key])}
                      onChange={(e) => setBool(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="font-serif text-xl text-slate-900">Digests & low involvement</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  Low-involvement days
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    value={settings.low_involvement_days}
                    onChange={(e) => setNum('low_involvement_days', e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Preferred digest hour (PT)
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    value={settings.digest_hour_pt}
                    onChange={(e) => setNum('digest_hour_pt', e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Alert email
                  <input
                    type="email"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    value={settings.alert_email || ''}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, alert_email: e.target.value || null }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  Alert phone (E.164)
                  <input
                    type="tel"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    value={settings.alert_phone || ''}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, alert_phone: e.target.value || null }))
                    }
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.digest_enabled}
                  onChange={(e) => setBool('digest_enabled', e.target.checked)}
                />
                Enable morning digest + low-involvement alerts
              </label>
            </section>

            <button
              type="submit"
              disabled={saving}
              className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#164040] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
