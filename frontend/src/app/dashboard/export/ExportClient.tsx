'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import AppShell from '@/components/AppShell';

type ExportPackage = {
  generated_at: string;
  range: { from: string; to: string };
  license: {
    license_number: string;
    entity_name: string;
    classification: string;
    workers_comp_status: string;
    rmo_name: string;
    license_expire_date?: string;
  };
  summary: {
    compliance_logs: number;
    reviewed_acks: number;
    flagged_logs: number;
    critical_logs: number;
    supervision_activities: number;
    projects: number;
    signed_audit_months: number;
  };
  duty_statement?: string | null;
  supervision_activities: Array<{
    activity_type: string;
    occurred_at: string;
    summary: string;
    details?: string | null;
    project_address?: string | null;
  }>;
  compliance_logs: Array<{
    id: string;
    created_at: string;
    call_timestamp?: string | null;
    source_type?: string;
    rmo_reviewed?: boolean;
    rmo_notes?: string | null;
    raw_payload?: string | null;
    risk_flags?: {
      flagged?: boolean;
      critical_flags?: string[];
      warning_flags?: string[];
    } | null;
    extracted_data?: {
      operator_name?: string;
      projects?: Array<{ address?: string }>;
    } | null;
  }>;
  acknowledgements: Array<{
    log_id: string;
    reviewed_at: string;
    notes?: string | null;
  }>;
  projects: Array<{
    project_address?: string;
    status?: string;
    contract_value?: number | null;
    permit_number?: string | null;
  }>;
};

type LicenseOption = { license_number: string; entity_name: string };

function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addPdfSection(doc: jsPDF, title: string, lines: string[]) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (need = 8) => {
    if (y + need > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  ensureSpace(12);
  doc.text(title, margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line || ' ', maxWidth) as string[];
    for (const w of wrapped) {
      ensureSpace(6);
      doc.text(w, margin, y);
      y += 5;
    }
    y += 2;
  }
}

function buildDefensePdf(pkg: ExportPackage): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const lic = pkg.license;

  addPdfSection(doc, 'RMO Audit Defense Package', [
    `Entity: ${lic.entity_name}`,
    `License #: ${lic.license_number}`,
    `Classification: ${lic.classification}`,
    `Workers' comp: ${lic.workers_comp_status}`,
    `RMO of record: ${lic.rmo_name}`,
    `License expire: ${lic.license_expire_date || 'n/a'}`,
    `Range: ${format(new Date(pkg.range.from), 'PP')} → ${format(new Date(pkg.range.to), 'PP')}`,
    `Generated: ${format(new Date(pkg.generated_at), 'PPpp')}`,
    '',
    pkg.duty_statement || 'Duty statement: see company onboarding records.'
  ]);

  doc.addPage();
  addPdfSection(doc, '1. Summary', [
    `Compliance reports: ${pkg.summary.compliance_logs}`,
    `RMO acknowledgements: ${pkg.summary.reviewed_acks}`,
    `Flagged reports: ${pkg.summary.flagged_logs}`,
    `Critical reports: ${pkg.summary.critical_logs}`,
    `Supervision activities: ${pkg.summary.supervision_activities}`,
    `Projects on file: ${pkg.summary.projects}`,
    `Signed monthly audits: ${pkg.summary.signed_audit_months}`
  ]);

  doc.addPage();
  addPdfSection(
    doc,
    '2. Supervision / site involvement',
    pkg.supervision_activities.length
      ? pkg.supervision_activities.map(
          (a) =>
            `${format(new Date(a.occurred_at), 'PP')} · ${a.activity_type.replace(/_/g, ' ')} · ${a.summary}${
              a.project_address ? ` · ${a.project_address}` : ''
            }`
        )
      : ['No supervision activities in range.']
  );

  doc.addPage();
  addPdfSection(
    doc,
    '3. Compliance reports & risk flags',
    pkg.compliance_logs.length
      ? pkg.compliance_logs.map((l) => {
          const when = format(new Date(l.call_timestamp || l.created_at), 'PP');
          const addr = l.extracted_data?.projects?.[0]?.address || 'report';
          const flags = [
            ...(l.risk_flags?.critical_flags || []),
            ...(l.risk_flags?.warning_flags || [])
          ].join(', ');
          return `${when} · ${l.source_type || 'LOG'} · ${addr}${
            flags ? ` · flags: ${flags}` : ' · no flags'
          }${l.rmo_reviewed ? ' · ACK' : ''}`;
        })
      : ['No compliance logs in range.']
  );

  doc.addPage();
  addPdfSection(
    doc,
    '4. RMO acknowledgements / decisions',
    pkg.acknowledgements.length
      ? pkg.acknowledgements.map(
          (a) =>
            `${format(new Date(a.reviewed_at), 'PP')} · log ${a.log_id.slice(0, 8)} · ${
              a.notes || 'Reviewed'
            }`
        )
      : ['No acknowledgements in range.']
  );

  doc.addPage();
  addPdfSection(
    doc,
    '5. Projects',
    pkg.projects.length
      ? pkg.projects.map(
          (p) =>
            `${p.project_address || 'Address n/a'} · ${p.status || 'ACTIVE'}${
              p.contract_value != null ? ` · $${Number(p.contract_value).toLocaleString()}` : ''
            }${p.permit_number ? ` · permit ${p.permit_number}` : ''}`
        )
      : ['No projects on file.']
  );

  return doc;
}

export default function ExportClient({ userName }: { userName: string }) {
  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [pkg, setPkg] = useState<ExportPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => {
        const list = (data.licenses || []) as LicenseOption[];
        setLicenses(list);
        if (list[0]) setLicenseNumber(list[0].license_number);
      })
      .catch(() => setError('Could not load memberships'));
  }, []);

  const qs = useMemo(() => {
    if (!licenseNumber) return '';
    const p = new URLSearchParams({
      license_number: licenseNumber,
      from: new Date(from).toISOString(),
      to: new Date(`${to}T23:59:59`).toISOString()
    });
    return p.toString();
  }, [licenseNumber, from, to]);

  async function loadPackage() {
    if (!qs) return;
    setLoading(true);
    setError('');
    setPkg(null);
    try {
      const res = await fetch(`/api/audit/export?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export failed');
      setPkg(data.package);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    if (!pkg) return;
    setBusy('Building multi-page PDF…');
    try {
      const doc = buildDefensePdf(pkg);
      doc.save(`rmo-defense-${pkg.license.license_number}-${from}_${to}.pdf`);
    } finally {
      setBusy('');
    }
  }

  async function downloadZip() {
    if (!pkg) return;
    setBusy('Building ZIP evidence package…');
    try {
      const zip = new JSZip();
      const root = `rmo-defense-${pkg.license.license_number}-${from}_${to}`;
      const folder = zip.folder(root)!;

      folder.file('manifest.json', JSON.stringify(pkg, null, 2));
      folder.file(
        'summary.txt',
        [
          `${pkg.license.entity_name} (#${pkg.license.license_number})`,
          `Range ${pkg.range.from} → ${pkg.range.to}`,
          `Logs ${pkg.summary.compliance_logs} · ACKs ${pkg.summary.reviewed_acks} · Critical ${pkg.summary.critical_logs}`,
          `Supervision ${pkg.summary.supervision_activities} · Projects ${pkg.summary.projects}`
        ].join('\n')
      );
      folder.file('supervision.json', JSON.stringify(pkg.supervision_activities, null, 2));
      folder.file('acknowledgements.json', JSON.stringify(pkg.acknowledgements, null, 2));
      folder.file('projects.json', JSON.stringify(pkg.projects, null, 2));
      folder.file('compliance_logs.json', JSON.stringify(pkg.compliance_logs, null, 2));

      const transcripts = folder.folder('transcripts')!;
      for (const log of pkg.compliance_logs) {
        if (log.raw_payload) transcripts.file(`${log.id}.txt`, log.raw_payload);
      }

      const pdfBlob = buildDefensePdf(pkg).output('blob');
      folder.file('audit-defense.pdf', pdfBlob);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${root}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy('');
    }
  }

  return (
    <AppShell mode="RMO" name={userName}>
      <div className="mb-6">
        <p className="text-sm uppercase tracking-wide text-slate-500">Audit defense</p>
        <h1 className="font-serif text-4xl">Evidence export</h1>
        <p className="mt-1 max-w-2xl text-slate-600">
          Multi-page PDF and ZIP package: company/duty snapshot, supervision, reports, risk flags,
          RMO acknowledgements, and projects for a company and date range.
        </p>
      </div>

      <div className="mb-6 grid gap-3 border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-slate-600">Company</span>
          <select
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            {licenses.map((l) => (
              <option key={l.license_number} value={l.license_number}>
                {l.entity_name} (#{l.license_number})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={loadPackage}
          disabled={loading || !licenseNumber}
          className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#163838] disabled:opacity-60 sm:col-span-4"
        >
          {loading ? 'Loading evidence…' : 'Build evidence package'}
        </button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {busy ? <p className="mb-4 text-sm text-slate-600">{busy}</p> : null}

      {pkg ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Reports</p>
              <p className="text-2xl font-semibold tabular-nums">{pkg.summary.compliance_logs}</p>
            </div>
            <div className="border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Acknowledgements</p>
              <p className="text-2xl font-semibold tabular-nums">{pkg.summary.reviewed_acks}</p>
            </div>
            <div className="border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Supervision</p>
              <p className="text-2xl font-semibold tabular-nums">
                {pkg.summary.supervision_activities}
              </p>
            </div>
            <div className="border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">Critical</p>
              <p className="text-2xl font-semibold tabular-nums text-red-800">
                {pkg.summary.critical_logs}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={downloadPdf}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Download multi-page PDF
            </button>
            <button
              type="button"
              onClick={downloadZip}
              className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#163838]"
            >
              Download ZIP evidence package
            </button>
          </div>

          <p className="text-sm text-slate-600">
            ZIP includes: audit-defense.pdf, manifest.json, supervision/acks/projects/logs JSON, and
            per-log transcript text files when available.
          </p>
        </div>
      ) : null}
    </AppShell>
  );
}
