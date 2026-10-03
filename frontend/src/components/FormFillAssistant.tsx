'use client';

import { FormEvent, useEffect, useState } from 'react';

type Kind = 'project' | 'sub';

export default function FormFillAssistant({
  kind,
  onApply
}: {
  kind: Kind;
  onApply: (fields: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!open || configured !== null) return;
    fetch('/api/ai/fill-form')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setConfigured(Boolean(data?.configured)))
      .catch(() => setConfigured(false));
  }, [open, configured]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    setError('');
    setHint('');
    try {
      const res = await fetch('/api/ai/fill-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, message: message.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 || data.configured === false) {
        setConfigured(false);
        setError(
          data.message ||
            'Assistant is not configured yet. Set ANTHROPIC_API_KEY on the server.'
        );
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || 'Assistant request failed');
      }
      const fields = (data.fields || {}) as Record<string, string>;
      onApply(fields);
      setHint('Fields filled — review the form, then save yourself.');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant request failed');
    } finally {
      setLoading(false);
    }
  }

  const placeholder =
    kind === 'project'
      ? 'e.g. Add kitchen remodel at 412 Oak St, permit B-2291, framing + electrical, about $48k, starting next Monday'
      : 'e.g. Add Sparks Electric, contact Maria (916) 555-0142, C-10, CSLB 987654, COI expires 2026-12-01';

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-teal-800/30 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-950 hover:bg-teal-100"
      >
        {open ? 'Hide AI fill' : 'AI fill assistant'}
      </button>

      {open ? (
        <div className="mt-3 border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">
            Describe the {kind === 'project' ? 'project' : 'sub'} in plain language
          </p>
          <p className="mt-1 text-xs text-slate-500">
            The assistant fills the form below. Nothing is saved until you click save.
          </p>

          {configured === false ? (
            <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Assistant is not configured yet. An admin needs to set{' '}
              <code className="rounded bg-white px-1">ANTHROPIC_API_KEY</code> on the server.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="mt-3 space-y-3">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder={placeholder}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              {error ? (
                <p className="text-sm text-red-700">{error}</p>
              ) : null}
              {hint ? <p className="text-sm text-teal-800">{hint}</p> : null}
              <button
                type="submit"
                disabled={loading || !message.trim()}
                className="rounded bg-[#0f2a2a] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#163838] disabled:opacity-50"
              >
                {loading ? 'Filling…' : 'Fill form'}
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
