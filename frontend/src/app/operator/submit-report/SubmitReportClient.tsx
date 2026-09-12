'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { DEFAULT_LICENSE } from '@/lib/constants';

export default function SubmitReportClient({ userName }: { userName: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const form = new FormData(e.currentTarget);
    const payload = {
      event: 'call_ended',
      call_id: `manual-${Date.now()}`,
      transcript: [
        `Operator ${form.get('operator_name')} reporting for license ${form.get('license_number')}.`,
        `Project at ${form.get('address')}, contract value ${form.get('contract_value') || 'unknown'}.`,
        `Trades: ${form.get('trades')}.`,
        `Subcontractors: ${form.get('subcontractors') || 'none named'}.`,
        `Crew status: ${form.get('crew')}.`,
        `Permits: ${form.get('permits') || 'none'}.`,
        form.get('notes') ? `Notes: ${form.get('notes')}` : ''
      ]
        .filter(Boolean)
        .join(' ')
    };

    // Prefer dedicated backend webhook if configured; otherwise local API stub stores via backend URL
    const backend =
      process.env.NEXT_PUBLIC_BACKEND_URL || 'https://temporary-speedy-ochre-5dx4e3g.vercel.app';

    const res = await fetch(`${backend}/api/webhooks/retell`, {
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
    setTimeout(() => router.push('/operator/history'), 1200);
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
              defaultValue="Jon Kim Beachum"
              required
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">License number</span>
            <input
              name="license_number"
              defaultValue={DEFAULT_LICENSE}
              required
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
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

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-[#0f2a2a] px-4 py-3 font-semibold text-white hover:bg-[#163838] disabled:opacity-60"
          >
            {loading ? 'Submitting…' : 'Submit report'}
          </button>
        </form>
        {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
      </div>
    </AppShell>
  );
}
