'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import FormFillAssistant from '@/components/FormFillAssistant';

export type SubEditorValues = {
  id?: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email: string;
  trade: string;
  cslb_license_number: string;
  coi_expiration_date: string;
  coi_document_url: string;
};

export default function SubEditor({
  mode,
  licenseNumber,
  initial,
  cancelHref
}: {
  mode: 'OPERATOR' | 'RMO';
  licenseNumber: string;
  initial?: Partial<SubEditorValues>;
  cancelHref: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<SubEditorValues>({
    id: initial?.id,
    company_name: initial?.company_name || '',
    contact_name: initial?.contact_name || '',
    phone: initial?.phone || '',
    email: initial?.email || '',
    trade: initial?.trade || '',
    cslb_license_number: initial?.cslb_license_number || '',
    coi_expiration_date: initial?.coi_expiration_date || '',
    coi_document_url: initial?.coi_document_url || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const listBase = mode === 'RMO' ? '/dashboard/subs' : '/operator/subs';

  function applyAiFields(fields: Record<string, string>) {
    setValues((v) => ({
      ...v,
      company_name: fields.company_name ?? v.company_name,
      contact_name: fields.contact_name ?? v.contact_name,
      phone: fields.phone ?? v.phone,
      email: fields.email ?? v.email,
      trade: fields.trade ?? v.trade,
      cslb_license_number: fields.cslb_license_number ?? v.cslb_license_number,
      coi_expiration_date: fields.coi_expiration_date ?? v.coi_expiration_date,
      coi_document_url: fields.coi_document_url ?? v.coi_document_url
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
        company_name: values.company_name,
        contact_name: values.contact_name,
        phone: values.phone,
        email: values.email,
        trade: values.trade,
        cslb_license_number: values.cslb_license_number,
        coi_expiration_date: values.coi_expiration_date,
        coi_document_url: values.coi_document_url
      };
      const res = await fetch('/api/subcontractors', {
        method: values.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      const id = data.subcontractor?.id || values.id;
      router.push(`${listBase}/${id}?license=${encodeURIComponent(licenseNumber)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <FormFillAssistant kind="sub" onApply={applyAiFields} />
      <form onSubmit={onSubmit} className="space-y-4 border border-slate-200 bg-white p-5">
        {error ? (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <label className="block text-sm">
          <span className="text-slate-600">Company name</span>
          <input
            required
            value={values.company_name}
            onChange={(e) => setValues({ ...values, company_name: e.target.value })}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-slate-600">Contact name</span>
            <input
              value={values.contact_name}
              onChange={(e) => setValues({ ...values, contact_name: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Phone</span>
            <input
              type="tel"
              value={values.phone}
              onChange={(e) => setValues({ ...values, phone: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Email</span>
            <input
              type="email"
              value={values.email}
              onChange={(e) => setValues({ ...values, email: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-600">Trade</span>
            <input
              value={values.trade}
              onChange={(e) => setValues({ ...values, trade: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              placeholder="C-10 Electrical"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">CSLB number</span>
            <input
              value={values.cslb_license_number}
              onChange={(e) => setValues({ ...values, cslb_license_number: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-600">COI expiration</span>
            <input
              type="date"
              value={values.coi_expiration_date}
              onChange={(e) => setValues({ ...values, coi_expiration_date: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">COI document URL</span>
            <input
              value={values.coi_document_url}
              onChange={(e) => setValues({ ...values, coi_document_url: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              placeholder="https://… (or upload via Vault / report)"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163838] disabled:opacity-50"
          >
            {saving ? 'Saving…' : values.id ? 'Save sub' : 'Add sub'}
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
