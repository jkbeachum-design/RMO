'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

type LicenseOption = {
  id: string;
  license_number: string;
  entity_name: string;
};

export default function SubmitReportClient({ userName }: { userName: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [licenseNumber, setLicenseNumber] = useState('');

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => {
        const list = (data.licenses || []) as LicenseOption[];
        setLicenses(list);
        if (list[0]) setLicenseNumber(list[0].license_number);
      })
      .catch(() => setMessage('Could not load your company memberships.'));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const form = new FormData(e.currentTarget);
    const selectedLicense = String(form.get('license_number') || licenseNumber);

    const payload = {
      operator_name: String(form.get('operator_name') || ''),
      license_number: selectedLicense,
      address: String(form.get('address') || ''),
      contract_value: String(form.get('contract_value') || ''),
      trades: String(form.get('trades') || ''),
      subcontractors: String(form.get('subcontractors') || ''),
      crew: String(form.get('crew') || ''),
      permits: String(form.get('permits') || ''),
      notes: String(form.get('notes') || '')
    };

    // Authenticated Next.js proxy — attaches webhook secret server-side; enforces membership
    const res = await fetch('/api/operator/submit-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setLoading(false);
    if (!res.ok) {
      const text = await res.text();
      setMessage(`Submit failed: ${text}`);
      return;
    }

    setMessage('Report submitted. It will appear in the compliance log shortly.');
    setTimeout(() => router.push(`/operator/history?license=${selectedLicense}`), 1200);
  }

  return (
    <AppShell mode="OPERATOR" name={userName}>
      <div className="mx-auto max-w-lg">
        <h1 className="font-serif text-4xl">Manual report</h1>
        <p className="mt-2 text-slate-600">
          Use this if you cannot call the compliance line. Same extraction and rule engine apply.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Operator name</span>
            <input
              name="operator_name"
              defaultValue={userName}
              required
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Company / license</span>
            <select
              name="license_number"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              required
              className="w-full rounded border border-slate-300 px-3 py-2"
            >
              {licenses.map((l) => (
                <option key={l.id} value={l.license_number}>
                  {l.entity_name} (#{l.license_number})
                </option>
              ))}
            </select>
            {!licenses.length ? (
              <span className="mt-1 block text-xs text-amber-700">Loading memberships…</span>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Project address</span>
            <input name="address" required className="w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Contract value (USD)</span>
            <input name="contract_value" className="w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Trades</span>
            <input
              name="trades"
              placeholder="Framing, Electrical, Plumbing"
              required
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Subcontractors</span>
            <input name="subcontractors" className="w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Crew status</span>
            <input
              name="crew"
              defaultValue="Everything is subcontractors, no direct employees"
              required
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Permits</span>
            <input name="permits" className="w-full rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Notes</span>
            <textarea name="notes" rows={3} className="w-full rounded border border-slate-300 px-3 py-2" />
          </label>

          {message ? <p className="text-sm text-slate-700">{message}</p> : null}

          <button
            type="submit"
            disabled={loading || !licenses.length}
            className="w-full rounded bg-[#0f2a2a] px-4 py-3 font-semibold text-white hover:bg-[#163838] disabled:opacity-60"
          >
            {loading ? 'Submitting…' : 'Submit report'}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
