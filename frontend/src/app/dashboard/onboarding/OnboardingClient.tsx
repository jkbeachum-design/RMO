'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { ONBOARDING_STEPS, type OnboardingStepId } from '@/lib/roles';

type LicenseOption = { id: string; license_number?: string; entity_name?: string };

type LicenseForm = {
  entity_name: string;
  rmo_name: string;
  business_address: string;
  classification: string;
  workers_comp_status: string;
  ownership_pct: string;
  is_subsidiary: boolean;
  is_joint_venture: boolean;
  officers_json: string;
  contractor_bond_status: string;
  contractor_bond_expire_date: string;
  bqi_status: string;
  bqi_expire_date: string;
  duty_statement: string;
  association_docs_url: string;
};

type Checklist = {
  has_entity: boolean;
  has_ownership: boolean;
  has_duty: boolean;
  has_bond: boolean;
  has_docs: boolean;
};

const EMPTY: LicenseForm = {
  entity_name: '',
  rmo_name: '',
  business_address: '',
  classification: '',
  workers_comp_status: '',
  ownership_pct: '',
  is_subsidiary: false,
  is_joint_venture: false,
  officers_json: '[]',
  contractor_bond_status: '',
  contractor_bond_expire_date: '',
  bqi_status: '',
  bqi_expire_date: '',
  duty_statement: '',
  association_docs_url: ''
};

export default function OnboardingClient({ userName }: { userName: string }) {
  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [licenseId, setLicenseId] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [form, setForm] = useState<LicenseForm>(EMPTY);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [complete, setComplete] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [step, setStep] = useState<OnboardingStepId>('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newLicenseNumber, setNewLicenseNumber] = useState('');
  const [newEntityName, setNewEntityName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const stepIndex = useMemo(
    () => Math.max(0, ONBOARDING_STEPS.findIndex((s) => s.id === step)),
    [step]
  );

  const load = useCallback(async (id?: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = id ? `?licenseId=${encodeURIComponent(id)}` : '';
      const res = await fetch(`/api/onboarding${qs}`);
      const data = await res.json();
      if (!res.ok && !data.license && data.error === 'Forbidden for license') {
        throw new Error(data.error);
      }
      if (!res.ok && !data.license && data.error === 'Unauthorized') {
        throw new Error(data.error);
      }
      setLicenses(data.licenses || []);
      setLicenseId(data.license_id || id || '');
      setCanEdit(Boolean(data.can_edit));
      setCanCreate(Boolean(data.can_create));
      setChecklist(data.checklist || null);
      setComplete(Boolean(data.complete));
      const lic = data.license || {};
      setLicenseNumber(String(lic.license_number || ''));
      setForm({
        entity_name: String(lic.entity_name || ''),
        rmo_name: String(lic.rmo_name || ''),
        business_address: String(lic.business_address || ''),
        classification: String(lic.classification || ''),
        workers_comp_status: String(lic.workers_comp_status || ''),
        ownership_pct:
          lic.ownership_pct == null || lic.ownership_pct === ''
            ? ''
            : String(lic.ownership_pct),
        is_subsidiary: Boolean(lic.is_subsidiary),
        is_joint_venture: Boolean(lic.is_joint_venture),
        officers_json: JSON.stringify(lic.officers_json || [], null, 2),
        contractor_bond_status: String(lic.contractor_bond_status || ''),
        contractor_bond_expire_date: String(lic.contractor_bond_expire_date || ''),
        bqi_status: String(lic.bqi_status || ''),
        bqi_expire_date: String(lic.bqi_expire_date || ''),
        duty_statement: String(lic.duty_statement || ''),
        association_docs_url: String(lic.association_docs_url || '')
      });
      setStep((lic.onboarding_step as OnboardingStepId) || 'company');
      if (data.migration_required) setError(data.hint || data.error || 'Migration required');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch<K extends keyof LicenseForm>(key: K, value: LicenseForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function createCompany(e: FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_number: newLicenseNumber.trim(),
          entity_name: newEntityName.trim(),
          rmo_name: userName
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.hint || 'Create failed');
      setShowAddCompany(false);
      setNewLicenseNumber('');
      setNewEntityName('');
      setMessage(`Company #${data.license?.license_number} added. Continue onboarding below.`);
      setLicenses(data.licenses || []);
      setLicenseId(data.license_id || '');
      setCanEdit(true);
      setCanCreate(Boolean(data.can_create));
      setChecklist(data.checklist || null);
      setComplete(false);
      const lic = data.license || {};
      setLicenseNumber(String(lic.license_number || ''));
      setForm({
        ...EMPTY,
        entity_name: String(lic.entity_name || ''),
        rmo_name: String(lic.rmo_name || userName),
        classification: String(lic.classification || ''),
        workers_comp_status: String(lic.workers_comp_status || ''),
        business_address: String(lic.business_address || '')
      });
      setStep('company');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function save(opts: { advance?: boolean; markComplete?: boolean } = {}) {
    if (!licenseId || !canEdit) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      let officers: unknown = [];
      try {
        officers = JSON.parse(form.officers_json || '[]');
      } catch {
        throw new Error('Officers JSON must be valid JSON');
      }
      const nextStep =
        opts.advance && stepIndex < ONBOARDING_STEPS.length - 1
          ? ONBOARDING_STEPS[stepIndex + 1].id
          : step;

      const res = await fetch('/api/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseId,
          mark_complete: opts.markComplete === true,
          entity_name: form.entity_name,
          rmo_name: form.rmo_name,
          business_address: form.business_address,
          classification: form.classification,
          workers_comp_status: form.workers_comp_status || null,
          ownership_pct: form.ownership_pct === '' ? null : Number(form.ownership_pct),
          is_subsidiary: form.is_subsidiary,
          is_joint_venture: form.is_joint_venture,
          officers_json: officers,
          contractor_bond_status: form.contractor_bond_status || null,
          contractor_bond_expire_date: form.contractor_bond_expire_date || null,
          bqi_status: form.bqi_status || null,
          bqi_expire_date: form.bqi_expire_date || null,
          duty_statement: form.duty_statement || null,
          association_docs_url: form.association_docs_url || null,
          onboarding_step: nextStep
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.hint || 'Save failed');
      setChecklist(data.checklist || null);
      setComplete(Boolean(data.complete));
      setStep(nextStep);
      setMessage(opts.markComplete ? 'Onboarding marked complete.' : 'Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await save({ advance: step !== 'review' });
  }

  const current = ONBOARDING_STEPS[stepIndex] || ONBOARDING_STEPS[0];

  return (
    <AppShell mode="RMO" name={userName}>
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-slate-900">Company onboarding</h1>
            <p className="mt-2 text-sm text-slate-600">
              You are signed in as RMO. Finish association docs, ownership, duty statement, and
              bonds for each company. When ready, invite the CEO from{' '}
              <a href="/dashboard/roles" className="text-teal-800 underline hover:text-teal-950">
                Roles
              </a>
              .
            </p>
          </div>
          {canCreate ? (
            <button
              type="button"
              onClick={() => {
                setShowAddCompany((v) => !v);
                setError('');
                setMessage('');
              }}
              className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#164040]"
            >
              {showAddCompany ? 'Cancel' : 'Add company'}
            </button>
          ) : null}
        </header>

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
        {complete ? (
          <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Onboarding complete for this company.
          </p>
        ) : null}

        {showAddCompany && canCreate ? (
          <form
            onSubmit={createCompany}
            className="space-y-4 rounded border border-slate-200 bg-slate-50 p-4"
          >
            <h2 className="font-serif text-lg text-slate-900">Add company to portfolio</h2>
            <p className="text-sm text-slate-600">
              Creates a new CSLB license record and attaches you as RMO. Existing companies
              (Beachum, Vanguard, etc.) stay unchanged.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                CSLB license number
                <input
                  required
                  inputMode="numeric"
                  pattern="\d{4,12}"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  value={newLicenseNumber}
                  onChange={(e) => setNewLicenseNumber(e.target.value)}
                  placeholder="e.g. 1234567"
                />
              </label>
              <label className="block text-sm">
                Entity name
                <input
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  value={newEntityName}
                  onChange={(e) => setNewEntityName(e.target.value)}
                  placeholder="Legal company name"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#164040] disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create company'}
            </button>
          </form>
        ) : null}

        <label className="block text-sm">
          Company
          <select
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            value={licenseId}
            onChange={(e) => {
              setLicenseId(e.target.value);
              void load(e.target.value);
            }}
            disabled={!licenses.length}
          >
            {!licenses.length ? <option value="">No companies yet</option> : null}
            {licenses.map((l) => (
              <option key={l.id} value={l.id}>
                {l.license_number} — {l.entity_name}
              </option>
            ))}
          </select>
        </label>

        {!licenseId && !loading ? (
          <p className="text-sm text-slate-600">
            {canCreate
              ? 'Add a company above to start the onboarding wizard.'
              : 'No company memberships available.'}
          </p>
        ) : null}

        {licenseId ? (
          <>
            <nav className="flex flex-wrap gap-2">
              {ONBOARDING_STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(s.id)}
                  className={`rounded px-3 py-1.5 text-xs ${
                    s.id === step
                      ? 'bg-[#0f2a2a] text-white'
                      : i < stepIndex
                        ? 'bg-teal-50 text-teal-900'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {i + 1}. {s.title}
                </button>
              ))}
            </nav>

            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : (
              <form onSubmit={onSubmit} className="space-y-6">
                <div>
                  <h2 className="font-serif text-xl text-slate-900">{current.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{current.blurb}</p>
                </div>

                {step === 'company' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                      CSLB license number
                      <input
                        className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700"
                        value={licenseNumber}
                        readOnly
                        disabled
                      />
                    </label>
                    <label className="block text-sm">
                      Entity name
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={form.entity_name}
                        disabled={!canEdit}
                        onChange={(e) => patch('entity_name', e.target.value)}
                      />
                    </label>
                    <label className="block text-sm">
                      RMO of record
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={form.rmo_name}
                        disabled={!canEdit}
                        onChange={(e) => patch('rmo_name', e.target.value)}
                      />
                    </label>
                    <label className="block text-sm">
                      Classification
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={form.classification}
                        disabled={!canEdit}
                        onChange={(e) => patch('classification', e.target.value)}
                      />
                    </label>
                    <label className="block text-sm">
                      Workers&apos; comp status
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={form.workers_comp_status}
                        disabled={!canEdit}
                        onChange={(e) => patch('workers_comp_status', e.target.value)}
                        placeholder="e.g. ACTIVE / EXEMPT"
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      Business address
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={form.business_address}
                        disabled={!canEdit}
                        onChange={(e) => patch('business_address', e.target.value)}
                      />
                    </label>
                  </div>
                ) : null}

                {step === 'ownership' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                      Ownership %
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={form.ownership_pct}
                        disabled={!canEdit}
                        onChange={(e) => patch('ownership_pct', e.target.value)}
                      />
                    </label>
                    <div className="flex flex-col justify-end gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.is_subsidiary}
                          disabled={!canEdit}
                          onChange={(e) => patch('is_subsidiary', e.target.checked)}
                        />
                        Subsidiary
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.is_joint_venture}
                          disabled={!canEdit}
                          onChange={(e) => patch('is_joint_venture', e.target.checked)}
                        />
                        Joint venture
                      </label>
                    </div>
                    <label className="block text-sm sm:col-span-2">
                      Officers (JSON array)
                      <textarea
                        rows={5}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                        value={form.officers_json}
                        disabled={!canEdit}
                        onChange={(e) => patch('officers_json', e.target.value)}
                      />
                    </label>
                  </div>
                ) : null}

                {step === 'duty' ? (
                  <label className="block text-sm">
                    Duty statement (min ~40 characters)
                    <textarea
                      rows={8}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                      value={form.duty_statement}
                      disabled={!canEdit}
                      onChange={(e) => patch('duty_statement', e.target.value)}
                      placeholder="Describe the qualifier’s duties for this firm…"
                    />
                  </label>
                ) : null}

                {step === 'bonds' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                      Contractor bond status
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={form.contractor_bond_status}
                        disabled={!canEdit}
                        onChange={(e) => patch('contractor_bond_status', e.target.value)}
                      />
                    </label>
                    <label className="block text-sm">
                      Bond expire date
                      <input
                        type="date"
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={form.contractor_bond_expire_date}
                        disabled={!canEdit}
                        onChange={(e) => patch('contractor_bond_expire_date', e.target.value)}
                      />
                    </label>
                    <label className="block text-sm">
                      BQI status
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={form.bqi_status}
                        disabled={!canEdit}
                        onChange={(e) => patch('bqi_status', e.target.value)}
                      />
                    </label>
                    <label className="block text-sm">
                      BQI expire date
                      <input
                        type="date"
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                        value={form.bqi_expire_date}
                        disabled={!canEdit}
                        onChange={(e) => patch('bqi_expire_date', e.target.value)}
                      />
                    </label>
                  </div>
                ) : null}

                {step === 'docs' ? (
                  <label className="block text-sm">
                    Association documents URL
                    <input
                      type="url"
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                      value={form.association_docs_url}
                      disabled={!canEdit}
                      onChange={(e) => patch('association_docs_url', e.target.value)}
                      placeholder="https://…"
                    />
                  </label>
                ) : null}

                {step === 'review' ? (
                  <div className="space-y-3 text-sm">
                    <ul className="space-y-1">
                      {(
                        [
                          ['Entity', checklist?.has_entity],
                          ['Ownership', checklist?.has_ownership],
                          ['Duty statement', checklist?.has_duty],
                          ['Bond status', checklist?.has_bond],
                          ['Association docs', checklist?.has_docs]
                        ] as Array<[string, boolean | undefined]>
                      ).map(([label, ok]) => (
                        <li key={label} className={ok ? 'text-emerald-800' : 'text-amber-800'}>
                          {ok ? '✓' : '○'} {label}
                        </li>
                      ))}
                    </ul>
                    <p className="text-slate-600">
                      Save once more if you edited earlier steps, then mark complete when all items
                      are checked.
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  {stepIndex > 0 ? (
                    <button
                      type="button"
                      className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      onClick={() => setStep(ONBOARDING_STEPS[stepIndex - 1].id)}
                    >
                      Back
                    </button>
                  ) : null}
                  {canEdit ? (
                    <>
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#164040] disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : step === 'review' ? 'Save' : 'Save & continue'}
                      </button>
                      {step === 'review' ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void save({ markComplete: true })}
                          className="rounded border border-teal-700 px-4 py-2 text-sm text-teal-900 hover:bg-teal-50 disabled:opacity-50"
                        >
                          Mark onboarding complete
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Only RMO or ADMIN can edit onboarding for this company.
                    </p>
                  )}
                </div>
              </form>
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
