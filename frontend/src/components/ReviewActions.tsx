'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ReviewActions({
  logId,
  initialNotes,
  reviewed
}: {
  logId: string;
  initialNotes: string;
  reviewed: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [done, setDone] = useState(reviewed);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function save(markReviewed: boolean) {
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/logs/${logId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rmo_notes: notes,
        rmo_reviewed: markReviewed || done
      })
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || 'Save failed');
      return;
    }
    if (markReviewed) setDone(true);
    setMessage(markReviewed ? 'Marked reviewed.' : 'Notes saved.');
    router.refresh();
  }

  return (
    <div className="border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-lg font-semibold">RMO review</h2>
      <p className="mb-3 text-sm text-slate-600">
        Status:{' '}
        <span className={done ? 'font-medium text-teal-800' : 'font-medium text-amber-800'}>
          {done ? 'Reviewed' : 'Pending review'}
        </span>
      </p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
        className="w-full rounded border border-slate-300 p-3 text-sm"
        placeholder="Supervisory notes…"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => save(false)}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          Save notes
        </button>
        <button
          type="button"
          disabled={saving || done}
          onClick={() => save(true)}
          className="rounded bg-[#0f2a2a] px-3 py-1.5 text-sm text-white hover:bg-[#163838] disabled:opacity-60"
        >
          Mark reviewed
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
