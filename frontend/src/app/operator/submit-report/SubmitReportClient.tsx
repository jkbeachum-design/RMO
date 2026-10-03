'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import {
  enqueueReport,
  flushAllQueuedReports,
  friendlyNetworkMessage,
  isNetworkError,
  loadLicensesCache,
  loadOperatorContextCache,
  saveLicensesCache,
  saveOperatorContextCache,
  type CachedLicense
} from '@/lib/offlineQueue';
import { useOnlineStatus } from '@/lib/useOnlineStatus';

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
  contactName: string;
  phone: string;
  email: string;
  cslbLicense: string;
  trade: string;
  coiExpiration: string;
  coiDocumentUrl: string;
  coiFile: File | null;
};

type KnownProject = {
  id: string;
  project_address: string;
  contract_value: number | null;
  permit_number: string | null;
  trades_involved: string[] | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  scope_description?: string | null;
};

type KnownSub = {
  id: string;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  cslb_license_number: string | null;
  trade: string | null;
  coi_expiration_date: string | null;
  coi_document_url: string | null;
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
  contactName: '',
  phone: '',
  email: '',
  cslbLicense: '',
  trade: '',
  coiExpiration: '',
  coiDocumentUrl: '',
  coiFile: null
});

function projectFromKnown(p: KnownProject): ProjectDraft {
  return {
    id: p.id,
    address: p.project_address || '',
    contractValue: p.contract_value != null ? String(p.contract_value) : '',
    trades: (p.trades_involved || []).join(', '),
    permitNumber: p.permit_number || '',
    startDate: p.start_date || '',
    endDate: p.end_date || '',
    closeOut: false
  };
}

function subFromKnown(s: KnownSub): SubDraft {
  return {
    id: s.id,
    company: s.company_name || '',
    contactName: s.contact_name || '',
    phone: s.phone || '',
    email: s.email || '',
    cslbLicense: s.cslb_license_number || '',
    trade: s.trade || '',
    coiExpiration: s.coi_expiration_date || '',
    coiDocumentUrl: s.coi_document_url || '',
    coiFile: null
  };
}

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
      <span
        className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: ok ? '#059669' : '#b91c1c' }}
        aria-hidden
      />
      <div>
        <p className="font-semibold">{ok ? 'COI current' : 'COI missing or expired'}</p>
        <p className="text-xs opacity-90">{detail}</p>
      </div>
    </div>
  );
}

function FileList({
  files,
  label,
  onRemove,
  onClear
}: {
  files: File[];
  label: string;
  onRemove: (index: number) => void;
  onClear: () => void;
}) {
  if (!files.length) return null;
  return (
    <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label} · {files.length} file{files.length === 1 ? '' : 's'}
      </p>
      <ul className="mt-1 space-y-1 text-sm text-slate-700">
        {files.map((f, idx) => (
          <li key={`${f.name}-${f.size}-${idx}`} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {f.name}{' '}
              <span className="text-xs text-slate-500">({(f.size / (1024 * 1024)).toFixed(1)} MB)</span>
            </span>
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="shrink-0 text-xs text-red-700 hover:underline"
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClear} className="mt-1 text-xs text-red-700 hover:underline">
        Clear all {label.toLowerCase()}
      </button>
    </div>
  );
}

type LicenseOption = CachedLicense;

function buildPayload(args: {
  operatorName: string;
  licenseId: string;
  projects: ProjectDraft[];
  subcontractors: SubDraft[];
  hasEmployees: boolean;
  crewExplanation: string;
  notes: string;
}) {
  const namedSubs = args.subcontractors.filter((s) => s.company.trim());
  return {
    namedSubs,
    projectsJson: args.projects.map((p) => {
      const closeOut = p.closeOut || Boolean(p.endDate);
      return {
        id: p.id || null,
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
        status: (closeOut ? 'COMPLETED' : 'ACTIVE') as 'ACTIVE' | 'ON_HOLD' | 'COMPLETED'
      };
    }),
    subsJson: namedSubs.map((s) => ({
      id: s.id || null,
      company: s.company,
      contactName: s.contactName || '',
      phone: s.phone || '',
      email: s.email || '',
      cslbLicense: s.cslbLicense,
      trade: s.trade,
      coiExpiration: s.coiExpiration,
      coiDocumentUrl: s.coiDocumentUrl || null
    })),
    crewStatus: {
      hasEmployees: args.hasEmployees,
      explanation: args.crewExplanation
    },
    notes: args.notes
  };
}

export default function SubmitReportClient({ userName }: { userName: string }) {
  const router = useRouter();
  const online = useOnlineStatus();

  const [operatorName, setOperatorName] = useState(userName);
  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [licenseId, setLicenseId] = useState('');
  const [knownProjects, setKnownProjects] = useState<KnownProject[]>([]);
  const [knownSubs, setKnownSubs] = useState<KnownSub[]>([]);
  const [projects, setProjects] = useState<ProjectDraft[]>([emptyProject()]);
  const [subcontractors, setSubcontractors] = useState<SubDraft[]>([emptySub()]);
  const [hasEmployees, setHasEmployees] = useState(false);
  const [crewExplanation, setCrewExplanation] = useState('');
  const [notes, setNotes] = useState('');
  const [permits, setPermits] = useState<File[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);
  const [usingCachedContext, setUsingCachedContext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const attachmentSummary = useMemo(() => {
    const coiCount = subcontractors.filter((s) => s.coiFile).length;
    return { coiCount, permitCount: permits.length, photoCount: photos.length };
  }, [subcontractors, permits, photos]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapLicenses() {
      try {
        const res = await fetch('/api/me');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Could not load memberships');
        }
        if (cancelled) return;
        const list = (data.licenses || []) as LicenseOption[];
        setLicenses(list);
        await saveLicensesCache(list).catch(() => {});
        if (!licenseId && list[0]) {
          setLicenseId(list[0].license_number);
        }
      } catch (err) {
        const cached = await loadLicensesCache().catch(() => null);
        if (cancelled) return;
        if (cached?.length) {
          setLicenses(cached);
          if (!licenseId && cached[0]) setLicenseId(cached[0].license_number);
          setUsingCachedContext(true);
          setError('');
          setMessage('Using saved company list while offline.');
        } else {
          setError(friendlyNetworkMessage(err));
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
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Could not load saved projects');
        }
        if (cancelled) return;

        const catalogProjects = (data.projects || []) as KnownProject[];
        const catalogSubs = (data.subcontractors || []) as KnownSub[];
        setKnownProjects(catalogProjects);
        setKnownSubs(catalogSubs);
        // Start with blank report rows — pick existing from dropdowns or add new
        setProjects([emptyProject()]);
        setSubcontractors([emptySub()]);
        setUsingCachedContext(false);
        await saveOperatorContextCache({
          licenseId,
          savedAt: new Date().toISOString(),
          projects: catalogProjects.map(projectFromKnown),
          subcontractors: catalogSubs.map((s) => {
            const mapped = subFromKnown(s);
            return {
              id: mapped.id,
              company: mapped.company,
              contactName: mapped.contactName,
              phone: mapped.phone,
              email: mapped.email,
              cslbLicense: mapped.cslbLicense,
              trade: mapped.trade,
              coiExpiration: mapped.coiExpiration,
              coiDocumentUrl: mapped.coiDocumentUrl
            };
          })
        }).catch(() => {});
      } catch (err) {
        const cached = await loadOperatorContextCache(licenseId).catch(() => null);
        if (cancelled) return;
        if (cached) {
          setKnownProjects(
            cached.projects
              .filter((p) => p.id)
              .map((p) => ({
                id: p.id as string,
                project_address: p.address,
                contract_value: p.contractValue ? Number(p.contractValue) : null,
                permit_number: p.permitNumber || null,
                trades_involved: p.trades
                  ? p.trades.split(',').map((t) => t.trim()).filter(Boolean)
                  : [],
                start_date: p.startDate || null,
                end_date: p.endDate || null,
                status: 'ACTIVE'
              }))
          );
          setKnownSubs(
            cached.subcontractors
              .filter((s) => s.id)
              .map((s) => ({
                id: s.id as string,
                company_name: s.company,
                contact_name: s.contactName || null,
                phone: s.phone || null,
                email: s.email || null,
                cslb_license_number: s.cslbLicense || null,
                trade: s.trade || null,
                coi_expiration_date: s.coiExpiration || null,
                coi_document_url: s.coiDocumentUrl || null
              }))
          );
          setProjects([emptyProject()]);
          setSubcontractors([emptySub()]);
          setUsingCachedContext(true);
          setError('');
          setMessage('Using last saved projects & subcontractors while offline.');
        } else {
          setError(friendlyNetworkMessage(err));
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

  useEffect(() => {
    if (!online) return;
    flushAllQueuedReports()
      .then((result) => {
        if (result.sent) {
          setMessage(
            `Sent ${result.sent} saved offline report${result.sent === 1 ? '' : 's'}.`
          );
        }
      })
      .catch(() => {});
  }, [online]);

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

  async function queueLocally(reason: 'offline' | 'network') {
    const payload = buildPayload({
      operatorName,
      licenseId,
      projects,
      subcontractors,
      hasEmployees,
      crewExplanation,
      notes
    });

    const queued = await enqueueReport({
      operatorName,
      licenseId,
      projects: payload.projectsJson,
      subcontractors: payload.subsJson,
      crewStatus: payload.crewStatus,
      notes: payload.notes,
      coiFiles: payload.namedSubs
        .map((s, index) => (s.coiFile ? { index, file: s.coiFile } : null))
        .filter(Boolean) as Array<{ index: number; file: File }>,
      permits,
      photos
    });

    const fileNote = queued.needsFileReattach
      ? ` Some files could not be stored locally (${queued.skippedFileNames.join(
          ', '
        )}) — re-attach them when online before sending.`
      : queued.files.length
        ? ` ${queued.files.length} attachment(s) kept on this phone.`
        : '';

    setNotes('');
    setPermits([]);
    setPhotos([]);
    setHasEmployees(false);
    setCrewExplanation('');
    setSubcontractors((subs) => subs.map((s) => ({ ...s, coiFile: null })));
    setError('');
    setMessage(
      reason === 'offline'
        ? `Saved offline — will send when you're back online.${fileNote}`
        : `Couldn't reach the server. Report saved on this phone and will retry when online.${fileNote}`
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    setError('');

    const payload = buildPayload({
      operatorName,
      licenseId,
      projects,
      subcontractors,
      hasEmployees,
      crewExplanation,
      notes
    });

    if (!online) {
      try {
        await queueLocally('offline');
      } catch (err) {
        setError(friendlyNetworkMessage(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const formData = new FormData();
    formData.append('operatorName', operatorName);
    formData.append('licenseId', licenseId);
    formData.append('projects', JSON.stringify(payload.projectsJson));
    formData.append('subcontractors', JSON.stringify(payload.subsJson));
    formData.append('crewStatus', JSON.stringify(payload.crewStatus));
    formData.append('notes', payload.notes);

    payload.namedSubs.forEach((s, idx) => {
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
      if (isNetworkError(err)) {
        try {
          await queueLocally('network');
        } catch (queueErr) {
          setError(friendlyNetworkMessage(queueErr));
        }
      } else {
        setError(friendlyNetworkMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell mode="OPERATOR" name={userName}>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-4xl">Submit Compliance Report</h1>
        <p className="mt-2 text-slate-600">
          Pick existing projects and subs from the dropdowns, or add new ones for this report. Each
          sub needs its own current COI on file.
        </p>
        {usingCachedContext ? (
          <p className="mt-2 text-xs text-amber-800">
            Showing last saved project/sub list from this phone (offline or unreachable).
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-8 space-y-8">
          <section className="border-l-4 border-teal-700 bg-white p-5 pl-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">CEO identification</h2>
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
                <p className="text-xs text-slate-500">Loading company projects & subcontractors…</p>
              ) : (
                <p className="text-xs text-slate-500">
                  {knownProjects.length} project{knownProjects.length === 1 ? '' : 's'} and{' '}
                  {knownSubs.length} sub{knownSubs.length === 1 ? '' : 's'} available to pick from.
                  Choose existing records from the dropdowns — or add new ones for this report.
                </p>
              )}
            </div>
          </section>

          <section className="border-l-4 border-emerald-600 bg-white p-5 pl-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Projects on this report</h2>
              <button
                type="button"
                onClick={() => setProjects([...projects, emptyProject()])}
                className="text-sm font-medium text-teal-800 hover:underline"
              >
                + Add project
              </button>
            </div>
            {projects.map((project, idx) => (
              <div key={`${project.id || 'new'}-${idx}`} className="mb-4 border border-slate-200 p-4 last:mb-0">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Project {idx + 1}
                  {project.closeOut ? ' · closing out' : ''}
                </p>
                <div className="space-y-3">
                  <label className="block text-sm text-slate-600">
                    Pick existing or new
                    <select
                      value={project.id || ''}
                      onChange={(e) => {
                        const next = [...projects];
                        const selectedId = e.target.value;
                        if (!selectedId) {
                          next[idx] = emptyProject();
                        } else {
                          const known = knownProjects.find((p) => p.id === selectedId);
                          next[idx] = known ? projectFromKnown(known) : emptyProject();
                        }
                        setProjects(next);
                      }}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    >
                      <option value="">New project…</option>
                      {knownProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.project_address}
                          {p.status === 'ON_HOLD' ? ' (on hold)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    type="text"
                    placeholder="Project address"
                    value={project.address}
                    required
                    onChange={(e) => {
                      const next = [...projects];
                      next[idx] = { ...next[idx], address: e.target.value, id: undefined };
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
                          endDate: closeOut ? next[idx].endDate || todayISO() : next[idx].endDate
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
              <h2 className="text-lg font-semibold">Subs on this report</h2>
              <button
                type="button"
                onClick={() => setSubcontractors([...subcontractors, emptySub()])}
                className="text-sm font-medium text-teal-800 hover:underline"
              >
                + Add sub
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Pick an existing sub or add a new one. Upload each COI here. Green = current COI on
              file and not expired. Offline COI picks are stored on this phone when possible.
            </p>
            {subcontractors.map((sub, idx) => (
              <div key={`${sub.id || 'new'}-${idx}`} className="mb-4 border border-slate-200 p-4 last:mb-0">
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
                  <label className="block text-sm text-slate-600">
                    Pick existing or new
                    <select
                      value={sub.id || ''}
                      onChange={(e) => {
                        const next = [...subcontractors];
                        const selectedId = e.target.value;
                        if (!selectedId) {
                          next[idx] = emptySub();
                        } else {
                          const known = knownSubs.find((s) => s.id === selectedId);
                          next[idx] = known ? subFromKnown(known) : emptySub();
                        }
                        setSubcontractors(next);
                      }}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                    >
                      <option value="">New sub…</option>
                      {knownSubs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.company_name}
                          {s.trade ? ` · ${s.trade}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    type="text"
                    placeholder="Company name"
                    value={sub.company}
                    onChange={(e) => {
                      const next = [...subcontractors];
                      next[idx] = { ...next[idx], company: e.target.value, id: undefined };
                      setSubcontractors(next);
                    }}
                    className="w-full rounded border border-slate-300 px-3 py-2"
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input
                      type="text"
                      placeholder="Contact name"
                      value={sub.contactName}
                      onChange={(e) => {
                        const next = [...subcontractors];
                        next[idx] = { ...next[idx], contactName: e.target.value };
                        setSubcontractors(next);
                      }}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={sub.phone}
                      onChange={(e) => {
                        const next = [...subcontractors];
                        next[idx] = { ...next[idx], phone: e.target.value };
                        setSubcontractors(next);
                      }}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={sub.email}
                      onChange={(e) => {
                        const next = [...subcontractors];
                        next[idx] = { ...next[idx], email: e.target.value };
                        setSubcontractors(next);
                      }}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </div>
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
                      Certificate of Insurance (PDF/JPG) — Sub {idx + 1}
                      {sub.company ? ` · ${sub.company}` : ''}
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
                    <p className="mt-1 text-xs text-slate-500">
                      Max 5MB · tied only to this subcontractor (not shared across subs)
                    </p>
                    {sub.coiFile ? (
                      <p className="mt-1 text-sm text-slate-700">
                        New upload ready for Sub {idx + 1}: {sub.coiFile.name}
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
                        On file:{' '}
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
            <p className="mb-3 text-xs text-slate-500">
              Multi-file OK. Summary:{' '}
              {attachmentSummary.coiCount} COI · {attachmentSummary.permitCount} permit
              {attachmentSummary.permitCount === 1 ? '' : 's'} · {attachmentSummary.photoCount}{' '}
              photo{attachmentSummary.photoCount === 1 ? '' : 's'}
            </p>
            <div className="space-y-4 text-sm">
              <div>
                <label className="mb-1 block font-medium text-slate-700">Building permits</label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setPermits(validateFiles(e.target.files))}
                />
                <FileList
                  files={permits}
                  label="Permits"
                  onRemove={(index) => setPermits(permits.filter((_, i) => i !== index))}
                  onClear={() => setPermits([])}
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700">Project photos</label>
                <input
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png"
                  onChange={(e) => setPhotos(validateFiles(e.target.files))}
                />
                <FileList
                  files={photos}
                  label="Photos"
                  onRemove={(index) => setPhotos(photos.filter((_, i) => i !== index))}
                  onClear={() => setPhotos([])}
                />
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
              {submitting
                ? online
                  ? 'Submitting…'
                  : 'Saving offline…'
                : online
                  ? 'Submit report'
                  : 'Save offline'}
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
