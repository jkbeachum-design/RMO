'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import FormFillAssistant from '@/components/FormFillAssistant';
import {
  PROJECT_STATUSES,
  normalizeProjectStatus,
  type ProjectStatus
} from '@/lib/projectStatus';

export type ProjectEditorValues = {
  id?: string;
  project_address: string;
  contract_value: string;
  permit_number: string;
  trades: string;
  scope_description: string;
  start_date: string;
  end_date: string;
  status: ProjectStatus;
};

export default function ProjectEditor({
  mode,
  licenseNumber,
  initial,
  cancelHref
}: {
  mode: 'OPERATOR' | 'RMO';
  licenseNumber: string;
  initial?: Partial<ProjectEditorValues>;
  cancelHref: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProjectEditorValues>({
    id: initial?.id,
    project_address: initial?.project_address || '',
    contract_value: initial?.contract_value || '',
    permit_number: initial?.permit_number || '',
    trades: initial?.trades || '',
    scope_description: initial?.scope_description || '',
    start_date: initial?.start_date || '',
    end_date: initial?.end_date || '',
    status: normalizeProjectStatus(initial?.status || 'ACTIVE')
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const listBase = mode === 'RMO' ? '/dashboard/projects' : '/operator/projects';

  function applyAiFields(fields: Record<string, string>) {
    setValues((v) => ({
      ...v,
      project_address: fields.project_address ?? v.project_address,
      contract_value: fields.contract_value ?? v.contract_value,
      permit_number: fields.permit_number ?? v.permit_number,
      trades: fields.trades ?? v.trades,
      scope_description: fields.scope_description ?? v.scope_description,
      start_date: fields.start_date ?? v.start_date,
      end_date: fields.end_date ?? v.end_date,
      status: normalizeProjectStatus(fields.status || v.status)
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        id: values.id,
        license_number: licenseNumber,
        project_address: values.project_address,
        contract_value: values.contract_value,
        permit_number: values.permit_number,
        trades: values.trades,
        scope_description: values.scope_description,
        start_date: values.start_date,
        end_date: values.end_date,
        status: values.status
      };
      const res = await fetch('/api/projects', {
        method: values.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      const id = data.project?.id || values.id;
      router.push(`${listBase}/${id}?license=${encodeURIComponent(licenseNumber)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function setStatusQuick(status: ProjectStatus) {
    if (!values.id) {
      setValues((v) => ({
        ...v,
        status,
        end_date:
          status === 'COMPLETED' ? v.end_date || new Date().toISOString().split('T')[0] : v.end_date
      }));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: values.id,
          status,
          end_date:
            status === 'COMPLETED'
              ? values.end_date || new Date().toISOString().split('T')[0]
              : values.end_date
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setValues((v) => ({
        ...v,
        status,
        end_date: data.project?.end_date || v.end_date
      }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <FormFillAssistant kind="project" onApply={applyAiFields} />
      <form onSubmit={onSubmit} className="space-y-4 border border-slate-200 bg-white p-5">
        {error ? (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <label className="block text-sm">
          <span className="text-slate-600">Project address</span>
          <input
            required
            value={values.project_address}
            onChange={(e) => setValues({ ...values, project_address: e.target.value })}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="123 Main St, Sacramento, CA"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-600">Contract value ($)</span>
            <input
              type="number"
              value={values.contract_value}
              onChange={(e) => setValues({ ...values, contract_value: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Permit number</span>
            <input
              value={values.permit_number}
              onChange={(e) => setValues({ ...values, permit_number: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-slate-600">Trades (comma-separated)</span>
          <input
            value={values.trades}
            onChange={(e) => setValues({ ...values, trades: e.target.value })}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="Framing, Electrical, Plumbing"
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">Scope</span>
          <textarea
            value={values.scope_description}
            onChange={(e) => setValues({ ...values, scope_description: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="Short description of the work"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-slate-600">Start date</span>
            <input
              type="date"
              value={values.start_date}
              onChange={(e) => setValues({ ...values, start_date: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">End date</span>
            <input
              type="date"
              value={values.end_date}
              onChange={(e) => setValues({ ...values, end_date: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Status</span>
            <select
              value={values.status}
              onChange={(e) =>
                setValues({
                  ...values,
                  status: normalizeProjectStatus(e.target.value)
                })
              }
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'ON_HOLD' ? 'On hold' : s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        </div>

        {values.id ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || values.status === 'ACTIVE'}
              onClick={() => void setStatusQuick('ACTIVE')}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Set active
            </button>
            <button
              type="button"
              disabled={saving || values.status === 'ON_HOLD'}
              onClick={() => void setStatusQuick('ON_HOLD')}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Put on hold
            </button>
            <button
              type="button"
              disabled={saving || values.status === 'COMPLETED'}
              onClick={() => void setStatusQuick('COMPLETED')}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Mark completed
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163838] disabled:opacity-50"
          >
            {saving ? 'Saving…' : values.id ? 'Save project' : 'Add project'}
          </button>
          <a
            href={cancelHref}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
