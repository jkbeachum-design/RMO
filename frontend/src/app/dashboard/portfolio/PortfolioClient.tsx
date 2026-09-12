'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import AppShell from '@/components/AppShell';
import {
  eligibilityLabel,
  type EligibilityBasis,
  type FirmAssociation
} from '@/lib/portfolio';

type ClockRow = {
  id: string;
  association_id: string;
  license_id: string;
  disassociated_at: string;
  notify_deadline: string;
  replace_deadline: string;
  notify_completed_at?: string | null;
  replace_completed_at?: string | null;
  license_number?: string;
  entity_name?: string;
  notify_days_left: number;
  replace_days_left: number;
  notify_level: string;
  replace_level: string;
};

type LimitInfo = {
  used: number;
  remaining: number;
  max: number;
  windowDays: number;
  atLimit: boolean;
  nearLimit: boolean;
  activeCount: number;
};

type LicenseOption = { id: string; license_number: string; entity_name: string };

const LEVEL_CLASS: Record<string, string> = {
  ok: 'border-slate-200 bg-white',
  warning: 'border-amber-300 bg-amber-50',
  critical: 'border-orange-400 bg-orange-50',
  overdue: 'border-red-400 bg-red-50'
};

export default function PortfolioClient({ userName }: { userName: string }) {
  const [associations, setAssociations] = useState<FirmAssociation[]>([]);
  const [clocks, setClocks] = useState<ClockRow[]>([]);
  const [limit, setLimit] = useState<LimitInfo | null>(null);
  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [migrationHint, setMigrationHint] = useState('');
  const [licenseId, setLicenseId] = useState('');
  const [basis, setBasis] = useState<EligibilityBasis>('PRIMARY');
  const [ownershipPct, setOwnershipPct] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [portfolioRes, meRes] = await Promise.all([
        fetch('/api/portfolio'),
        fetch('/api/me')
      ]);
      const portfolio = await portfolioRes.json();
      const me = await meRes.json();
      if (!portfolioRes.ok) throw new Error(portfolio.error || 'Failed to load portfolio');
      setAssociations(portfolio.associations || []);
      setClocks(portfolio.clocks || []);
      setLimit(portfolio.limit || null);
      setMigrationHint(
        portfolio.migration_required
          ? portfolio.hint || 'Apply supabase/migrations/004_firm_portfolio_clocks.sql'
          : ''
      );
      const list = (me.licenses || []) as LicenseOption[];
      setLicenses(list);
      setLicenseId((prev) => prev || list[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onAssociate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    const res = await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'associate',
        license_id: licenseId,
        eligibility_basis: basis,
        ownership_pct: ownershipPct ? Number(ownershipPct) : null
      })
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'Associate failed');
      return;
    }
    setMessage('Firm association recorded.');
    await reload();
  }

  async function onDisassociate(associationId: string) {
    if (!confirm('Start §7068.2 disassociation clocks (90-day notify + replace)?')) return;
    setSaving(true);
    const res = await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disassociate', association_id: associationId })
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'Disassociate failed');
      return;
    }
    setMessage('Disassociation recorded. 90-day notify and replace clocks started.');
    await reload();
  }

  async function completeClock(
    clockId: string,
    action: 'complete_notify' | 'complete_replace'
  ) {
    const res = await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, clock_id: clockId })
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Update failed');
      return;
    }
    await reload();
  }

  const openClocks = clocks.filter((c) => !c.notify_completed_at || !c.replace_completed_at);

  return (
    <AppShell mode="RMO" name={userName}>
      <div className="mb-6">
        <p className="text-sm uppercase tracking-wide text-slate-500">CSLB §7068.1 / §7068.2</p>
        <h1 className="font-serif text-4xl">Firm portfolio</h1>
        <p className="mt-1 max-w-2xl text-slate-600">
          Track multi-firm associations (max 3 firms in any one-year period) and disassociation
          clocks (notify board + replace qualifier within 90 days).
        </p>
      </div>

      {migrationHint ? (
        <p className="mb-4 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {migrationHint}
        </p>
      ) : null}
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mb-4 text-sm text-teal-800">{message}</p> : null}

      {limit ? (
        <div className="mb-8 grid gap-3 sm:grid-cols-4">
          <div
            className={`border p-4 ${
              limit.atLimit ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
            }`}
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">Rolling 1-year usage</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {limit.used}
              <span className="text-lg text-slate-500"> / {limit.max}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">§7068.1 firm associations</p>
          </div>
          <div className="border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Slots remaining</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{limit.remaining}</p>
          </div>
          <div className="border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Active now</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{limit.activeCount}</p>
          </div>
          <div className="border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Open clocks</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{openClocks.length}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Associations</h2>
          {loading ? <p className="text-slate-500">Loading…</p> : null}
          {associations.map((a) => (
            <div
              key={a.id}
              className={`border p-4 ${
                a.status === 'ACTIVE' ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {a.status} · {eligibilityLabel(a.eligibility_basis)}
                    {a.ownership_pct != null ? ` · ${a.ownership_pct}% ownership` : ''}
                  </p>
                  <p className="font-medium">
                    {a.entity_name || 'Firm'}
                    {a.license_number ? ` (#${a.license_number})` : ''}
                  </p>
                  <p className="text-sm text-slate-600">
                    Associated {format(new Date(a.associated_at), 'PP')}
                    {a.disassociated_at
                      ? ` · Disassociated ${format(new Date(a.disassociated_at), 'PP')}`
                      : ''}
                  </p>
                </div>
                {a.status === 'ACTIVE' && !String(a.id).startsWith('synth-') ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => onDisassociate(a.id)}
                    className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
                  >
                    Disassociate
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {!loading && !associations.length ? (
            <p className="text-slate-500">No firm associations yet.</p>
          ) : null}
        </section>

        <div className="space-y-8">
          <form onSubmit={onAssociate} className="space-y-3 border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Record association</h2>
            <p className="text-sm text-slate-600">
              Additional firms beyond the primary require an eligibility basis (20% ownership,
              subsidiary/JV, or majority same officers).
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Company</span>
              <select
                value={licenseId}
                onChange={(e) => setLicenseId(e.target.value)}
                required
                className="w-full rounded border border-slate-300 px-3 py-2"
              >
                {licenses.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.entity_name} (#{l.license_number})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Eligibility basis</span>
              <select
                value={basis}
                onChange={(e) => setBasis(e.target.value as EligibilityBasis)}
                className="w-full rounded border border-slate-300 px-3 py-2"
              >
                {(
                  [
                    'PRIMARY',
                    'OWNERSHIP_20',
                    'SUBSIDIARY_JV',
                    'SAME_OFFICERS',
                    'OTHER'
                  ] as EligibilityBasis[]
                ).map((b) => (
                  <option key={b} value={b}>
                    {eligibilityLabel(b)}
                  </option>
                ))}
              </select>
            </label>
            {basis === 'OWNERSHIP_20' ? (
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Ownership %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={ownershipPct}
                  onChange={(e) => setOwnershipPct(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
            ) : null}
            <button
              type="submit"
              disabled={saving || Boolean(limit?.atLimit) || !licenseId}
              className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#163838] disabled:opacity-60"
            >
              {limit?.atLimit ? 'At §7068.1 limit' : saving ? 'Saving…' : 'Add association'}
            </button>
          </form>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">§7068.2 disassociation clocks</h2>
            {clocks.map((c) => (
              <div
                key={c.id}
                className={`border p-4 ${LEVEL_CLASS[c.replace_level] || LEVEL_CLASS.ok}`}
              >
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {c.entity_name || 'Firm'}
                  {c.license_number ? ` #${c.license_number}` : ''}
                </p>
                <p className="text-sm text-slate-700">
                  Disassociated {format(new Date(c.disassociated_at), 'PP')}
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Notify CSLB · {c.notify_days_left}d · due{' '}
                      {format(new Date(c.notify_deadline), 'PP')}
                      {c.notify_completed_at ? ' · done' : ''}
                    </span>
                    {!c.notify_completed_at ? (
                      <button
                        type="button"
                        onClick={() => completeClock(c.id, 'complete_notify')}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      >
                        Mark notified
                      </button>
                    ) : null}
                  </li>
                  <li className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Replace qualifier · {c.replace_days_left}d · due{' '}
                      {format(new Date(c.replace_deadline), 'PP')}
                      {c.replace_completed_at ? ' · done' : ''}
                    </span>
                    {!c.replace_completed_at ? (
                      <button
                        type="button"
                        onClick={() => completeClock(c.id, 'complete_replace')}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      >
                        Mark replaced
                      </button>
                    ) : null}
                  </li>
                </ul>
              </div>
            ))}
            {!clocks.length ? (
              <p className="text-sm text-slate-500">No open disassociation clocks.</p>
            ) : null}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
