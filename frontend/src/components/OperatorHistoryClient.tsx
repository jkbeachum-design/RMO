'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import Link from 'next/link';
import { RiskFlagList } from '@/components/RiskFlagBadge';
import type { ComplianceLog, ExtractedData } from '@/lib/types';

type EditDraft = {
  operator_name: string;
  notes: string;
  address: string;
  contract_value: string;
  trades: string;
  permit_number: string;
  has_direct_employees: boolean;
  crew_statement: string;
  sub_company: string;
  sub_license: string;
  sub_trade: string;
  sub_coi: string;
};

function toDraft(log: ComplianceLog): EditDraft {
  const extracted = (log.extracted_data || {}) as ExtractedData;
  const project = extracted.projects?.[0];
  const sub = extracted.subcontractors?.[0];
  return {
    operator_name: extracted.operator_name || '',
    notes: extracted.notes || '',
    address: project?.address || '',
    contract_value:
      project?.contract_value != null ? String(project.contract_value) : '',
    trades: (project?.trades || []).join(', '),
    permit_number: project?.permit_number || extracted.permits?.[0]?.permit_number || '',
    has_direct_employees: Boolean(extracted.crew_status?.has_direct_employees),
    crew_statement: extracted.crew_status?.raw_statement || '',
    sub_company: sub?.company_name || '',
    sub_license: sub?.cslb_license_number || '',
    sub_trade: sub?.trade || '',
    sub_coi: sub?.coi_expiration_date || ''
  };
}

export default function OperatorHistoryClient({
  initialLogs,
  backendUrl
}: {
  initialLogs: ComplianceLog[];
  backendUrl: string;
}) {
  const router = useRouter();
  const [logs, setLogs] = useState(initialLogs);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const editingLog = useMemo(
    () => logs.find((l) => l.id === editingId) || null,
    [logs, editingId]
  );

  function startEdit(log: ComplianceLog) {
    setEditingId(log.id);
    setDraft(toDraft(log));
    setMessage('');
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setError('');
  }

  async function saveEdit() {
    if (!editingLog || !draft) return;
    setSaving(true);
    setError('');
    setMessage('');

    const prev = (editingLog.extracted_data || {}) as ExtractedData;
    const trades = draft.trades
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const projects = [...(prev.projects || [])];
    if (!projects.length) {
      projects.push({
        address: draft.address,
        contract_value: draft.contract_value ? Number(draft.contract_value) : null,
        trades,
        permit_number: draft.permit_number || null
      });
    } else {
      projects[0] = {
        ...projects[0],
        address: draft.address,
        contract_value: draft.contract_value ? Number(draft.contract_value) : null,
        trades,
        permit_number: draft.permit_number || null
      };
    }

    const subcontractors = [...(prev.subcontractors || [])];
    if (draft.sub_company.trim()) {
      const subRow = {
        company_name: draft.sub_company.trim(),
        cslb_license_number: draft.sub_license || null,
        trade: draft.sub_trade || null,
        coi_expiration_date: draft.sub_coi || null,
        cslb_verified: false
      };
      if (!subcontractors.length) subcontractors.push(subRow);
      else subcontractors[0] = { ...subcontractors[0], ...subRow };
    }

    const extracted_data: ExtractedData = {
      ...prev,
      operator_name: draft.operator_name,
      notes: draft.notes,
      projects,
      subcontractors,
      crew_status: {
        has_direct_employees: draft.has_direct_employees,
        employee_count: prev.crew_status?.employee_count ?? null,
        raw_statement:
          draft.crew_statement ||
          (draft.has_direct_employees
            ? 'Operator reported direct employees/hired crew'
            : 'No direct employees — everything subcontractors')
      }
    };

    try {
      const res = await fetch(`${backendUrl}/api/compliance-logs/${editingLog.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extracted_data,
          notes: draft.notes
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Update failed (${res.status})`);
        setSaving(false);
        return;
      }

      setLogs((prevLogs) =>
        prevLogs.map((l) => (l.id === editingLog.id ? (data.log as ComplianceLog) : l))
      );
      setMessage('Report updated. Risk flags were recalculated.');
      setEditingId(null);
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-4xl">Your reports</h1>
      <p className="mt-2 text-slate-600">
        Recent check-ins. Open <strong>Edit report</strong> to fix typos or correct details —
        risk flags recalculate on save.
      </p>

      {message ? <p className="mt-4 text-sm text-teal-800">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

      <div className="mt-8 space-y-3">
        {logs.map((log) => {
          const isEditing = editingId === log.id;
          return (
            <div key={log.id} className="border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">
                    {format(new Date(log.call_timestamp || log.created_at), 'PPp')} ·{' '}
                    {log.source_channel === 'PWA' || log.source_type === 'PWA_FORM'
                      ? 'Form'
                      : 'Voice'}
                  </p>
                  <p className="font-medium">
                    {log.extracted_data?.projects?.[0]?.address || 'Report'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {log.extracted_data?.operator_name || '—'}
                    {log.extracted_data?.projects?.[0]?.contract_value != null
                      ? ` · $${Number(log.extracted_data.projects[0].contract_value).toLocaleString()}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <RiskFlagList riskFlags={log.risk_flags} />
                  {!isEditing ? (
                    <button
                      type="button"
                      onClick={() => startEdit(log)}
                      className="text-sm font-medium text-teal-800 hover:underline"
                    >
                      Edit report
                    </button>
                  ) : null}
                </div>
              </div>

              {isEditing && draft ? (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <p className="text-sm font-semibold text-slate-800">Edit report</p>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Operator name</span>
                    <input
                      value={draft.operator_name}
                      onChange={(e) => setDraft({ ...draft, operator_name: e.target.value })}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Project address</span>
                    <input
                      value={draft.address}
                      onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-600">Contract value ($)</span>
                      <input
                        type="number"
                        value={draft.contract_value}
                        onChange={(e) => setDraft({ ...draft, contract_value: e.target.value })}
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-600">Permit number</span>
                      <input
                        value={draft.permit_number}
                        onChange={(e) => setDraft({ ...draft, permit_number: e.target.value })}
                        className="w-full rounded border border-slate-300 px-3 py-2"
                      />
                    </label>
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Trades (comma-separated)</span>
                    <input
                      value={draft.trades}
                      onChange={(e) => setDraft({ ...draft, trades: e.target.value })}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </label>

                  <div className="rounded border border-slate-200 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      First subcontractor
                    </p>
                    <div className="space-y-2">
                      <input
                        placeholder="Company"
                        value={draft.sub_company}
                        onChange={(e) => setDraft({ ...draft, sub_company: e.target.value })}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        placeholder="CSLB #"
                        value={draft.sub_license}
                        onChange={(e) => setDraft({ ...draft, sub_license: e.target.value })}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        placeholder="Trade"
                        value={draft.sub_trade}
                        onChange={(e) => setDraft({ ...draft, sub_trade: e.target.value })}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="date"
                        value={draft.sub_coi}
                        onChange={(e) => setDraft({ ...draft, sub_coi: e.target.value })}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.has_direct_employees}
                        onChange={(e) =>
                          setDraft({ ...draft, has_direct_employees: e.target.checked })
                        }
                      />
                      Direct employees / hired crew
                    </label>
                    <textarea
                      value={draft.crew_statement}
                      onChange={(e) => setDraft({ ...draft, crew_statement: e.target.value })}
                      rows={2}
                      placeholder="Crew status statement"
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </div>

                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Notes</span>
                    <textarea
                      value={draft.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                      rows={3}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={saveEdit}
                      className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163838] disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save corrections'}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={cancelEdit}
                      className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {!logs.length ? (
          <p className="text-slate-500">No reports yet. Call the compliance line to file one.</p>
        ) : null}
      </div>

      <Link href="/operator" className="mt-6 inline-block text-sm text-teal-800 hover:underline">
        ← Back to check-in
      </Link>
    </div>
  );
}
