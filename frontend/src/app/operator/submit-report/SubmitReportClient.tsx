'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

type ProjectDraft = {
  id?: string;
  address: string;
  contractValue: string;
  trades: string;
  permitNumber: string;
  startDate: string;
  endDate: string;
  closeOut: boolean;
};

type SubDraft = {
  id?: string;
  company: string;
  cslbLicense: string;
  trade: string;
  coiExpiration: string;
  coiDocumentUrl: string;
  coiFile: File | null;
};

const emptyProject = (): ProjectDraft => ({
  address: '',
  contractValue: '',
  trades: '',
  permitNumber: '',
  startDate: '',
  endDate: '',
  closeOut: false
});

const emptySub = (): SubDraft => ({
  company: '',
  cslbLicense: '',
  trade: '',
  coiExpiration: '',
  coiDocumentUrl: '',
  coiFile: null
});

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function hasCurrentCoi(sub: SubDraft): boolean {
  const onFile = Boolean(sub.coiDocumentUrl || sub.coiFile);
  const notExpired = Boolean(sub.coiExpiration && sub.coiExpiration >= todayISO());
  return onFile && notExpired;
}

function CoiStatusBadge({ sub }: { sub: SubDraft }) {
  const ok = hasCurrentCoi(sub);
  const onFile = Boolean(sub.coiDocumentUrl || sub.coiFile);
  const expired = Boolean(sub.coiExpiration && sub.coiExpiration < todayISO());

  let detail = 'No COI on file';
  if (ok) detail = `Current COI on file · expires ${sub.coiExpiration}`;
  else if (onFile && expired) detail = `COI on file but expired ${sub.coiExpiration}`;
  else if (onFile && !sub.coiExpiration) detail = 'COI file present · add expiration date';
  else if (!onFile && sub.coiExpiration && sub.coiExpiration >= todayISO()) {
    detail = 'Expiration set · upload COI document';
  } else if (expired) detail = `Expired ${sub.coiExpiration} · upload new COI`;

  return (
    <div
      className={`flex items-start gap-2 rounded border px-3 py-2 text-sm ${
        ok
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
          : 'border-red-300 bg-red-50 text-red-900'
      }`}
      title={detail}
    >
      <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ok ? '#059669' : '#b91c1c' }} aria-hidden />
      <div>
        <p className="font-semibold">{ok ? 'COI current' : 'COI missing or expired'}</p>
        <p className="text-xs opacity-90">{detail}</p>
      </div>
    </div>
  );
}

function FileList({ files, onClear }: { files: File[]; onClear: () => void }) {
  if (!files.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm text-slate-700">
      {files.map((f) => (
        <li key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-2">
          <span className="truncate">
            ✓ {f.name} ({(f.size / (1024 * 1024)).toFixed(1)} MB)
          </span>
        </li>
      ))}
      <li>
        <button type="button" onClick={onClear} className="text-xs text-red-700 hover:underline">
          Clear files
        </button>
      </li>
    </ul>
  );
}

type LicenseOption = { id: string; license_number: string; entity_name: string };

export default function SubmitReportClient({ userName }: { userName: string }) {
  const router = useRouter();

  const [operatorName, setOperatorName] = useState(userName);
  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [licenseId, setLicenseId] = useState('');
  const [projects, setProjects] = useState<ProjectDraft[]>([emptyProject()]);
  const [subcontractors, setSubcontractors] = useState<SubDraft[]>([emptySub()]);
  const [hasEmployees, setHasEmployees] = useState(false);
  const [crewExplanation, setCrewExplanation] = useState('');
  const [notes, setNotes] = useState('');
  const [permits, setPermits] = useState<File[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function bootstrapLicenses() {
      try {
        const res = await fetch('/api/me');
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error || 'Could not load memberships');
          return;
        }
        if (cancelled) return;
        const list = (data.licenses || []) as LicenseOption[];
        setLicenses(list);
        if (!licenseId && list[0]) {
          setLicenseId(list[0].license_number);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load memberships');
        }
      }
    }

    bootstrapLicenses();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      if (!licenseId) {
        setLoadingContext(false);
        return;
      }
      setLoadingContext(true);
      setError('');
      try {
        const res = await fetch(
          `/api/operator-context?license_number=${encodeURIComponent(licenseId)}`
        );
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error || 'Could not load saved projects');
          return;
        }
        if (cancelled) return;

        const mappedProjects: ProjectDraft[] =
          (data.projects || []).map(
            (p: {
              id: string;
              project_address: string;
              contract_value: number | null;
              permit_number: string | null;
              trades_involved: string[] | null;
              start_date: string | null;
              end_date: string | null;
            }) => ({
              id: p.id,
              address: p.project_address || '',
              contractValue:
                p.contract_value != null ? String(p.contract_value) : '',
              trades: (p.trades_involved || []).join(', '),
              permitNumber: p.permit_number || '',
              startDate: p.start_date || '',
              endDate: p.end_date || '',
              closeOut: false
            })
          ) || [];

        const mappedSubs: SubDraft[] =
          (data.subcontractors || []).map(
            (s: {
              id: string;
              company_name: string;
              cslb_license_number: string | null;
              trade: string | null;
              coi_expiration_date: string | null;
              coi_document_url: string | null;
            }) => ({
              id: s.id,
              company: s.company_name || '',
              cslbLicense: s.cslb_license_number || '',
              trade: s.trade || '',
              coiExpiration: s.coi_expiration_date || '',
              coiDocumentUrl: s.coi_document_url || '',
              coiFile: null
            })
          ) || [];

        setProjects(mappedProjects.length ? mappedProjects : [emptyProject()]);
        setSubcontractors(mappedSubs.length ? mappedSubs : [emptySub()]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load saved projects');
        }
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    }

    loadContext();
    return () => {
      cancelled = true;
    };
  }, [licenseId]);

  function validateSingleFile(file: File | null, maxMb = 5): File | null {
    if (!file) return null;
    if (file.size > maxMb * 1024 * 1024) {
      setError(`${file.name} exceeds ${maxMb}MB limit`);
      return null;
    }
    setError('');
    return file;
  }

  function validateFiles(list: FileList | null, maxMb = 5): File[] {
    const files = Array.from(list || []);
    const oversized = files.find((f) => f.size > maxMb * 1024 * 1024);
    if (oversized) {
      setError(`${oversized.name} exceeds ${maxMb}MB limit`);
      return [];
    }
    setError('');
    return files;
  }

  function clearTransientFields() {
    setNotes('');
    setPermits([]);
    setPhotos([]);
    setMessage('');
    setError('');
    setHasEmployees(false);
    setCrewExplanation('');
    setSubcontractors((subs) => subs.map((s) => ({ ...s, coiFile: null })));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    setError('');

    const namedSubs = subcontractors.filter((s) => s.company.trim());

    const formData = new FormData();
    formData.append('operatorName', operatorName);
    formData.append('licenseId', licenseId);
    formData.append(
      'projects',
      JSON.stringify(
        projects.map((p) => {
          const closeOut = p.closeOut || Boolean(p.endDate);
          return {
            address: p.address,
            contractValue: p.contractValue,
            trades: p.trades
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
            permitNumber: p.permitNumber,
            startDate: p.startDate || null,
            endDate: p.endDate || (closeOut ? todayISO() : null),
            closed: closeOut,
            status: closeOut ? 'COMPLETED' : 'ACTIVE'
          };
        })
      )
    );
    formData.append(
      'subcontractors',
      JSON.stringify(
        namedSubs.map((s) => ({
          company: s.company,
          cslbLicense: s.cslbLicense,
          trade: s.trade,
          coiExpiration: s.coiExpiration,
          coiDocumentUrl: s.coiDocumentUrl || null
        }))
      )
    );
    formData.append(
      'crewStatus',
      JSON.stringify({
        hasEmployees,
        explanation: crewExplanation
      })
    );
    formData.append('notes', notes);

    namedSubs.forEach((s, idx) => {
      if (s.coiFile) formData.append(`coi_${idx}`, s.coiFile);
    });
    permits.forEach((f) => formData.append('permits', f));
    photos.forEach((f) => formData.append('photos', f));

    try {
      const res = await fetch('/api/operator/submit-report', {
        method: 'POST',
        body: formData
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || `Submit failed (${res.status})`);
        setSubmitting(false);
        return;
      }

      const closedCount = projects.filter((p) => p.closeOut || p.endDate).length;
      setMessage(
        `Report submitted. Log ID ${data.logId}${
          data.risk_count ? ` · ${data.risk_count} risk flag(s)` : ''
        }${closedCount ? ` · ${closedCount} project(s) closed out` : ''}. RMO will review shortly.`
      );
      setTimeout(() => router.push('/operator/history'), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell mode="OPERATOR" name={userName}>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-4xl">Submit Compliance Report</h1>
        <p className="mt-2 text-slate-600">
          Active projects and subcontractors load from your license each time. Each sub needs its
          own current COI on file.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-8">
          <section className="border-l-4 border-teal-700 bg-white p-5 pl-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Operator identification</h2>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Your name</span>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  required
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Company / license</span>
                <select
                  value={licenseId}
                  onChange={(e) => setLicenseId(e.target.value)}
                  required
                  className="w-full rounded border border-slate-300 px-3 py-2"
                >
                  {!licenses.length ? <option value="">Loading…</option> : null}
                  {licenses.map((l) => (
                    <option key={l.id} value={l.license_number}>
                      {l.entity_name} (#{l.license_number})
                    </option>
                  ))}
                </select>
              </label>
              {loadingContext ? (
                <p className="text-xs text-slate-500">Loading saved projects & subcontractors…</p>
              ) : (
                <p className="text-xs text-slate-500">
                  Showing saved ACTIVE projects and all subcontractors for this license.
                </p>
              )}
            </div>
          </section>

          <section className="border-l-4 border-emerald-600 bg-white p-5 pl-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Active projects</h2>
              <button
                type="button"
                onClick={() => setProjects([...projects, emptyProject()])}
                className="text-sm font-medium text-teal-800 hover:underline"
              >
                + Add project
              </button>
            </div>
            {projects.map((project, idx) => (
              <div key={project.id || idx} className="mb-4 border border-slate-200 p-4 last:mb-0">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Project {idx + 1}
                  {project.closeOut ? ' · closing out' : ''}
                </p>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Project address"
                    value={project.address}
                    required
                    onChange={(e) => {
                      const next = [...projects];
                      next[idx] = { ...next[idx], address: e.target.value };
                      setProjects(next);
                    }}
                    className="w-full rounded border border-slate-300 px-3 py-2"
                  />
                  <input
                    type="number"
                    placeholder="Contract value ($)"
                    value={project.contractValue}
                    onChange={(e) => {
                      const next = [...projects];
                      next[idx] = { ...next[idx], contractValue: e.target.value };
                      setProjects(next);
                    }}
                    className="w-full rounded border border-slate-300 px-3 py-2"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm text-slate-600">
                      Start date
                      <input
                        type="date"
                        value={project.startDate}
                        onChange={(e) => {
                          const next = [...projects];
                          next[idx] = { ...next[idx], startDate: e.target.value };
                          setProjects(next);
                        }}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="block text-sm text-slate-600">
                      Finish date
                      <input
                        type="date"
                        value={project.endDate}
                        onChange={(e) => {
                          const next = [...projects];
                          const endDate = e.target.value;
                          next[idx] = {
                            ...next[idx],
                            endDate,
                            closeOut: Boolean(endDate) || next[idx].closeOut
                          };
                          setProjects(next);
                        }}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder="Trades (comma-separated: Framing, Electrical, Plumbing)"
                    value={project.trades}
                    onChange={(e) => {
                      const next = [...projects];
                      next[idx] = { ...next[idx], trades: e.target.value };
                      setProjects(next);
                    }}
                    className="w-full rounded border border-slate-300 px-3 py-2"
                  />
                  <input
                    type="text"
                    placeholder="Permit number"
                    value={project.permitNumber}
                    onChange={(e) => {
                      const next = [...projects];
                      next[idx] = { ...next[idx], permitNumber: e.target.value };
                      setProjects(next);
                    }}
                    className="w-full rounded border border-slate-300 px-3 py-2"
                  />
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={project.closeOut}
                      onChange={(e) => {
                        const next = [...projects];
                        const closeOut = e.target.checked;
                        next[idx] = {
                          ...next[idx],
                          closeOut,
                          endDate: closeOut
                            ? next[idx].endDate || todayISO()
                            : next[idx].endDate
                        };
                        setProjects(next);
                      }}
                    />
                    <span>
                      Close out this project
                      <span className="block text-xs text-slate-500">
                        Sets status to COMPLETED and removes it from the active list next time.
                      </span>
                    </span>
                  </label>
                </div>
                {projects.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setProjects(projects.filter((_, i) => i !== idx))}
                    className="mt-2 text-sm text-red-700 hover:underline"
                  >
                    Remove from this report
                  </button>
                ) : null}
              </div>
            ))}
          </section>

          <section className="border-l-4 border-amber-500 bg-white p-5 pl-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Subcontractors</h2>
              <button
                type="button"
                onClick={() => setSubcontractors([...subcontractors, emptySub()])}
                className="text-sm font-medium text-teal-800 hover:underline"
              >
                + Add subcontractor
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Upload each sub&apos;s COI here. Green = current COI on file and not expired.
            </p>
            {subcontractors.map((sub, idx) => (
              <div key={sub.id || idx} className="mb-4 border border-slate-200 p-4 last:mb-0">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Sub {idx + 1}
                    {sub.company ? ` · ${sub.company}` : ''}
                  </p>
                </div>
                <div className="mb-3">
                  <CoiStatusBadge sub={sub} />
                </div>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Company name"
                    value={sub.company}
                    onChange={(e) => {
                      const next = [...subcontractors];
                      next[idx] = { ...next[idx], company: e.target.value };
                      setSubcontractors(next);
                    }}
                    className="w-full rounded border border-slate-300 px-3 py-2"
                  />
                  <input
                    type="text"
                    placeholder="CSLB license number"
                    value={sub.cslbLicense}
                    onChange={(e) => {
                      const next = [...subcontractors];
                      next[idx] = { ...next[idx], cslbLicense: e.target.value };
                      setSubcontractors(next);
                    }}
                    className="w-full rounded border border-slate-300 px-3 py-2"
                  />
                  <input
                    type="text"
                    placeholder="Trade (e.g., C-10 Electrical)"
                    value={sub.trade}
                    onChange={(e) => {
                      const next = [...subcontractors];
                      next[idx] = { ...next[idx], trade: e.target.value };
                      setSubcontractors(next);
                    }}
                    className="w-full rounded border border-slate-300 px-3 py-2"
                  />
                  <label className="block text-sm text-slate-600">
                    COI expiration
                    <input
                      type="date"
                      value={sub.coiExpiration}
                      onChange={(e) => {
                        const next = [...subcontractors];
                        next[idx] = { ...next[idx], coiExpiration: e.target.value };
                        setSubcontractors(next);
                      }}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Certificate of Insurance (PDF/JPG)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = validateSingleFile(e.target.files?.[0] || null);
                        const next = [...subcontractors];
                        next[idx] = { ...next[idx], coiFile: file };
                        setSubcontractors(next);
                      }}
                    />
                    <p className="mt-1 text-xs text-slate-500">Max 5MB · tied to this subcontractor</p>
                    {sub.coiFile ? (
                      <p className="mt-1 text-sm text-slate-700">
                        ✓ New upload: {sub.coiFile.name}
                        <button
                          type="button"
                          className="ml-2 text-xs text-red-700 hover:underline"
                          onClick={() => {
                            const next = [...subcontractors];
                            next[idx] = { ...next[idx], coiFile: null };
                            setSubcontractors(next);
                          }}
                        >
                          remove
                        </button>
                      </p>
                    ) : null}
                    {!sub.coiFile && sub.coiDocumentUrl ? (
                      <p className="mt-1 text-sm text-slate-700">
                        ✓ On file:{' '}
                        <a
                          href={sub.coiDocumentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal-800 hover:underline"
                        >
                          view COI
                        </a>
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSubcontractors(subcontractors.filter((_, i) => i !== idx))}
                  className="mt-2 text-sm text-red-700 hover:underline"
                >
                  Remove from this report
                </button>
              </div>
            ))}
          </section>

          <section className="border-l-4 border-red-600 bg-white p-5 pl-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Crew status</h2>
            <div className="space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!hasEmployees}
                  onChange={() => setHasEmployees(false)}
                />
                <span>No direct employees (everything subcontractors)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={hasEmployees}
                  onChange={() => setHasEmployees(true)}
                />
                <span>Yes, we have direct employees or hired crew</span>
              </label>
              {hasEmployees ? (
                <textarea
                  value={crewExplanation}
                  onChange={(e) => setCrewExplanation(e.target.value)}
                  placeholder="How many employees? What roles?"
                  rows={3}
                  className="w-full rounded border border-slate-300 px-3 py-2"
                />
              ) : null}
            </div>
          </section>

          <section className="border-l-4 border-slate-500 bg-white p-5 pl-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Document uploads (optional)</h2>
            <div className="space-y-4 text-sm">
              <div>
                <label className="mb-1 block font-medium text-slate-700">Building permits</label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setPermits(validateFiles(e.target.files))}
                />
                <FileList files={permits} onClear={() => setPermits([])} />
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700">Project photos</label>
                <input
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png"
                  onChange={(e) => setPhotos(validateFiles(e.target.files))}
                />
                <FileList files={photos} onClear={() => setPhotos([])} />
              </div>
            </div>
          </section>

          <section className="border-l-4 border-slate-400 bg-white p-5 pl-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Additional notes (optional)</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else the RMO should know about this reporting period?"
              rows={4}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting || loadingContext}
              className="rounded bg-[#0f2a2a] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#163838] disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
            <button
              type="button"
              onClick={clearTransientFields}
              className="rounded border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Clear notes & uploads
            </button>
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {message ? <p className="text-sm text-teal-800">{message}</p> : null}
        </form>
      </div>
    </AppShell>
  );
}
