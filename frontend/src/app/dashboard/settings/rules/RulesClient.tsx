'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import SettingsBack from '@/components/SettingsBack';
import {
  DEFAULT_COMPLIANCE_SETTINGS,
  type ComplianceSettings
} from '@/lib/rules';

type LicenseOption = {
  id: string;
  license_number?: string;
  entity_name?: string;
};

export default function RulesClient({ userName }: { userName: string }) {
  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [licenseId, setLicenseId] = useState('');
  const [settings, setSettings] = useState<ComplianceSettings>({
    ...DEFAULT_COMPLIANCE_SETTINGS
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      setMessage('Rules saved. The rule engine uses these values on the next report.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
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
      <SettingsBack href="/dashboard/settings" />
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <header>
          <h1 className="font-serif text-3xl text-slate-900">Compliance rules</h1>
          <p className="mt-2 text-sm text-slate-600">
            Per-company thresholds for the compliance rule engine and the low-involvement window.
            Digest and alert delivery live under Settings → Notifications.
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
              className="mt-1 block w-full max-w-xs rounded border border-slate-300 px-3 py-2"
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
              <h2 className="font-serif text-xl text-slate-900">Low involvement</h2>
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
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="font-serif text-xl text-slate-900">Required report reminders</h2>
              <p className="text-sm text-slate-600">
                Email CEOs before and after each due date via the daily digest cron. Default cadence is
                every other Thursday (Pacific), starting from the anchor date. Also requires a report
                within 3 days of a project being created, started, or completed.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.reminder_enabled === true}
                  onChange={(e) => setBool('reminder_enabled', e.target.checked)}
                />
                Enable required-report reminders for this company
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  Cadence
                  <select
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    value={settings.report_cadence}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        report_cadence: e.target.value as ComplianceSettings['report_cadence']
                      }))
                    }
                  >
                    <option value="biweekly">Every other week</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Every 4 weeks</option>
                  </select>
                </label>
                <label className="block text-sm">
                  Due weekday (Pacific)
                  <select
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    value={settings.report_due_weekday}
                    onChange={(e) => setNum('report_due_weekday', e.target.value)}
                  >
                    <option value={1}>Monday</option>
                    <option value={2}>Tuesday</option>
                    <option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option>
                    <option value={5}>Friday</option>
                  </select>
                </label>
                <label className="block text-sm sm:col-span-2">
                  First due date (anchor, YYYY-MM-DD Pacific)
                  <input
                    type="date"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    value={settings.report_anchor_date}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, report_anchor_date: e.target.value }))
                    }
                  />
                </label>
              </div>
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
