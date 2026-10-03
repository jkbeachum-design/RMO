'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VaultUploadForm({ licenseNumber }: { licenseNumber: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('OTHER');
  const [expiresOn, setExpiresOn] = useState('');
  const [relatedName, setRelatedName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Choose a file to upload');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.append('license_number', licenseNumber);
      form.append('title', title);
      form.append('doc_type', docType);
      if (expiresOn) form.append('expires_on', expiresOn);
      if (relatedName) form.append('related_name', relatedName);
      form.append('file', file);
      const res = await fetch('/api/documents', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setMessage('Document added to vault.');
      setTitle('');
      setExpiresOn('');
      setRelatedName('');
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 space-y-3 border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">Add a document</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-slate-600">Title</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="COI — Sparks Electric"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Type</span>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="COI">COI</option>
            <option value="PERMIT">Permit</option>
            <option value="PHOTO">Photo</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Expires (optional)</span>
          <input
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Related name (optional)</span>
          <input
            value={relatedName}
            onChange={(e) => setRelatedName(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="Company or project"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-slate-600">File (PDF/JPG/PNG, max 5MB)</span>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mt-1 block w-full text-sm"
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-teal-800">{message}</p> : null}
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163838] disabled:opacity-50"
      >
        {saving ? 'Uploading…' : 'Upload document'}
      </button>
    </form>
  );
}
