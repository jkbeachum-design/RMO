'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import AppShell from '@/components/AppShell';

const ACTIVITY_TYPES = [
  { value: 'ONSITE_VISIT', label: 'On-site visit' },
  { value: 'SUPERVISE_OPS', label: 'Supervise operations' },
  { value: 'TECH_ADMIN_DECISION', label: 'Technical / admin decision' },
  { value: 'WORKMANSHIP_QC', label: 'Workmanship / QC check' },
  { value: 'MONITOR_DELEGATED', label: 'Monitor delegated work' },
  { value: 'OTHER', label: 'Other' }
];

type Activity = {
  id: string;
  activity_type: string;
  occurred_at: string;
  summary: string;
  details: string | null;
  project_address: string | null;
};

type LicenseOption = { license_number: string; entity_name: string };

export default function SupervisionClient({ userName }: { userName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const licenseFromQuery = searchParams.get('license') || '';

  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [licenseNumber, setLicenseNumber] = useState(licenseFromQuery);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [heatmap, setHeatmap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [activityType, setActivityType] = useState('ONSITE_VISIT');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [projectAddress, setProjectAddress] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => {
        const list = (data.licenses || []) as LicenseOption[];
        setLicenses(list);
        if (!licenseNumber && list[0]) setLicenseNumber(list[0].license_number);
      })
      .catch(() => setError('Could not load memberships'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!licenseNumber) return;
    setLoading(true);
    fetch(`/api/supervision?license_number=${encodeURIComponent(licenseNumber)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || data.hint || 'Failed to load');
        setActivities(data.activities || []);
        setHeatmap(data.heatmap || {});
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [licenseNumber]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    const res = await fetch('/api/supervision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_number: licenseNumber,
        activity_type: activityType,
        summary,
        details,
        project_address: projectAddress || null
      })
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'Save failed');
      return;
    }
    setSummary('');
    setDetails('');
    setProjectAddress('');
    setMessage('Supervision activity recorded.');
    setActivities((prev) => [data.activity, ...prev]);
    router.refresh();
  }

  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const maxHeat = Math.max(1, ...Object.values(heatmap));

  return (
    <AppShell mode="RMO" name={userName}>
      <div className="mb-6">
        <p className="text-sm uppercase tracking-wide text-slate-500">Evidence</p>
        <h1 className="font-serif text-4xl">Supervision log</h1>
        <p className="mt-1 text-slate-600">
          Record RMO involvement — site visits, decisions, QC — for CSLB oversight evidence.
        </p>
      </div>

      <label className="mb-6 block max-w-sm text-sm">
        <span className="mb-1 block text-slate-500">Company</span>
        <select
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2"
        >
          {licenses.map((l) => (
            <option key={l.license_number} value={l.license_number}>
              {l.entity_name} (#{l.license_number})
            </option>
          ))}
        </select>
      </label>

      <section className="mb-8 border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold">30-day involvement</h2>
        <div className="flex flex-wrap gap-1">
          {days.map((day) => {
            const count = heatmap[day] || 0;
            const intensity = count === 0 ? 0 : 0.2 + (0.8 * count) / maxHeat;
            return (
              <div
                key={day}
                title={`${day}: ${count} activit${count === 1 ? 'y' : 'ies'}`}
                className="h-4 w-4 rounded-sm border border-slate-200"
                style={{
                  background:
                    count === 0
                      ? '#f8fafc'
                      : `rgba(15, 42, 42, ${intensity.toFixed(2)})`
                }}
              />
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">Each cell is one day · darker = more logged activity</p>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="space-y-3 border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Log activity</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Type</span>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Summary</span>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
              className="w-full rounded border border-slate-300 px-3 py-2"
              placeholder="Inspected framing at 123 Main"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Project address (optional)</span>
            <input
              value={projectAddress}
              onChange={(e) => setProjectAddress(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Details (optional)</span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {message ? <p className="text-sm text-teal-800">{message}</p> : null}
          <button
            type="submit"
            disabled={saving || !licenseNumber}
            className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#163838] disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save activity'}
          </button>
        </form>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent entries</h2>
          {loading ? <p className="text-slate-500">Loading…</p> : null}
          {activities.map((a) => (
            <div key={a.id} className="border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {a.activity_type.replace(/_/g, ' ')} ·{' '}
                {format(new Date(a.occurred_at), 'PPp')}
              </p>
              <p className="font-medium">{a.summary}</p>
              {a.project_address ? (
                <p className="text-sm text-slate-600">{a.project_address}</p>
              ) : null}
              {a.details ? <p className="mt-1 text-sm text-slate-600">{a.details}</p> : null}
            </div>
          ))}
          {!loading && !activities.length ? (
            <p className="text-slate-500">No supervision activities yet for this company.</p>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
