'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import AppShell from '@/components/AppShell';
import { formatPacific, type ActivityStatus } from '@/lib/activity';

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

type OperatorActivityRow = {
  userId: string;
  name: string;
  email: string;
  roles: string[];
  lastOpen: string | null;
  lastSignIn: string | null;
  lastReport: string | null;
  daysSinceReport: number | null;
  status: ActivityStatus;
  thresholds: { amber: number; red: number };
};

type RecentPortalEvent = {
  id: string;
  userId: string;
  event: string;
  path: string | null;
  createdAt: string;
  userName: string;
};

function statusStyles(status: ActivityStatus): string {
  if (status === 'green') return 'bg-emerald-100 text-emerald-900 border-emerald-300';
  if (status === 'amber') return 'bg-amber-100 text-amber-950 border-amber-300';
  return 'bg-red-100 text-red-900 border-red-300';
}

function statusLabel(row: OperatorActivityRow): string {
  if (row.daysSinceReport == null) return 'No reports';
  if (row.status === 'green') return `${row.daysSinceReport}d · OK`;
  if (row.status === 'amber') return `${row.daysSinceReport}d · Watch`;
  return `${row.daysSinceReport}d · Stale`;
}

function eventLabel(event: string): string {
  return event.replace(/_/g, ' ');
}

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

  const [operators, setOperators] = useState<OperatorActivityRow[]>([]);
  const [recentPortalEvents, setRecentPortalEvents] = useState<RecentPortalEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [lowInvolvementDays, setLowInvolvementDays] = useState(14);

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

  useEffect(() => {
    if (!licenseNumber) return;
    setActivityLoading(true);
    fetch(`/api/activity?license_number=${encodeURIComponent(licenseNumber)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || data.hint || 'Failed to load activity');
        setOperators(data.operators || []);
        setRecentPortalEvents(data.recentEvents || []);
        setLowInvolvementDays(Number(data.lowInvolvementDays) || 14);
        setActivityError('');
      })
      .catch((err) => setActivityError(err.message))
      .finally(() => setActivityLoading(false));
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
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Operator activity</h2>
            <p className="mt-1 text-sm text-slate-600">
              Are CEOs opening the portal and filing reports? Times in Pacific (America/Los_Angeles).
              Stale after {Math.max(1, Math.floor(lowInvolvementDays / 2))}/{lowInvolvementDays} days.
            </p>
          </div>
          <Link
            href="/dashboard/alerts"
            className="shrink-0 text-sm font-medium text-teal-900 underline hover:text-teal-700"
          >
            Phone alerts / Send test
          </Link>
        </div>

        {activityLoading ? <p className="text-sm text-slate-500">Loading activity…</p> : null}
        {activityError ? <p className="text-sm text-red-700">{activityError}</p> : null}

        {!activityLoading && !operators.length && !activityError ? (
          <p className="text-sm text-slate-500">No CEO / operator members on this license yet.</p>
        ) : null}

        {operators.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Operator</th>
                  <th className="py-2 pr-3 font-medium">Last open</th>
                  <th className="py-2 pr-3 font-medium">Last sign-in</th>
                  <th className="py-2 pr-3 font-medium">Last report</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {operators.map((op) => (
                  <tr key={op.userId} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-3">
                      <p className="font-medium text-slate-900">{op.name}</p>
                      <p className="text-xs text-slate-500">{op.email}</p>
                    </td>
                    <td className="py-3 pr-3 text-slate-700">{formatPacific(op.lastOpen)}</td>
                    <td className="py-3 pr-3 text-slate-700">{formatPacific(op.lastSignIn)}</td>
                    <td className="py-3 pr-3 text-slate-700">{formatPacific(op.lastReport)}</td>
                    <td className="py-3">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${statusStyles(op.status)}`}
                      >
                        {statusLabel(op)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {recentPortalEvents.length ? (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Recent portal events</h3>
            <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
              {recentPortalEvents.map((ev) => (
                <li key={ev.id} className="flex flex-wrap gap-x-2 border-b border-slate-100 pb-2 text-slate-700">
                  <span className="font-medium text-slate-900">{ev.userName}</span>
                  <span className="uppercase tracking-wide text-slate-500">{eventLabel(ev.event)}</span>
                  <span className="text-slate-500">{formatPacific(ev.createdAt)}</span>
                  {ev.path ? <span className="text-xs text-slate-400">{ev.path}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

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
