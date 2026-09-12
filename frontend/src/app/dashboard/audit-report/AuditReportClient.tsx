'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import AppShell from '@/components/AppShell';
import type { ComplianceLog, License } from '@/lib/types';

type ReportPayload = {
  month: string;
  audit_month: string;
  total_calls: number;
  total_flags: number;
  critical_flags: number;
  logs: ComplianceLog[];
};

function AuditReportInner({ userName }: { userName: string }) {
  const searchParams = useSearchParams();
  const licenseFromQuery = searchParams.get('license');
  const signatureRef = useRef<SignatureCanvas | null>(null);
  const reportRef = useRef<HTMLDivElement | null>(null);

  const [licenseNumber, setLicenseNumber] = useState(licenseFromQuery || '');
  const [license, setLicense] = useState<License | null>(null);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = licenseFromQuery
      ? `?license_number=${encodeURIComponent(licenseFromQuery)}`
      : '';
    fetch(`/api/audit${qs}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setMessage(data.error);
          setLicense(null);
          setReport(null);
          return;
        }
        setLicense(data.license || null);
        setReport(data.report || null);
        if (data.license?.license_number) {
          setLicenseNumber(data.license.license_number);
        }
      })
      .finally(() => setLoading(false));
  }, [licenseFromQuery]);

  async function signAndSubmit() {
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      setMessage('Please sign the report first.');
      return;
    }
    const signature = signatureRef.current.toDataURL('image/png');
    const res = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_number: licenseNumber,
        notes,
        signature,
        report_json: report
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || 'Submit failed');
      return;
    }
    setMessage('Audit report signed and submitted.');
  }

  async function downloadPdf() {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 2 });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const img = canvas.toDataURL('image/png');
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;
    pdf.addImage(img, 'PNG', 0, 0, width, Math.min(height, pdf.internal.pageSize.getHeight()));
    pdf.save(`rmo-audit-${licenseNumber}-${report?.audit_month || 'month'}.pdf`);
  }

  if (loading) {
    return (
      <AppShell mode="RMO" name={userName}>
        <p>Loading audit report…</p>
      </AppShell>
    );
  }

  if (!license || !report) {
    return (
      <AppShell mode="RMO" name={userName}>
        <p>Unable to load audit report.</p>
      </AppShell>
    );
  }

  return (
    <AppShell mode="RMO" name={userName}>
      <h1 className="mb-6 font-serif text-4xl">Monthly Audit Report</h1>

      <div ref={reportRef} className="mb-8 border border-slate-300 bg-white p-8">
        <h2 className="text-2xl font-semibold">Monthly Compliance Audit Report</h2>
        <p className="mt-1 text-slate-600">
          {license.entity_name} (License #{license.license_number})
        </p>
        <p className="text-slate-600">{report.month}</p>

        <section className="mt-8">
          <h3 className="mb-3 text-lg font-semibold">Summary</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              Total compliance reports: <strong>{report.total_calls}</strong>
            </li>
            <li>
              Risk flags raised: <strong>{report.total_flags}</strong>
            </li>
            <li>
              Critical-flagged reports: <strong>{report.critical_flags}</strong>
            </li>
            <li>
              Workers&apos; comp status: <strong>{license.workers_comp_status}</strong>
            </li>
            <li>
              License expiry: <strong>{license.license_expire_date}</strong>
            </li>
          </ul>
        </section>

        <section className="mt-8">
          <h3 className="mb-3 text-lg font-semibold">Compliance activities</h3>
          <div className="space-y-3">
            {report.logs.map((log) => (
              <div key={log.id} className="border-l-4 border-teal-700 pl-4 text-sm">
                <p className="text-slate-500">
                  {format(new Date(log.call_timestamp || log.created_at), 'PP')}
                </p>
                <p className="font-medium">
                  {log.extracted_data?.projects?.[0]?.address || log.source_type}
                </p>
                {log.risk_flags?.raw_flags?.length ? (
                  <p className="text-amber-800">
                    Flags: {log.risk_flags.raw_flags.map((f) => f.flag).join(', ')}
                  </p>
                ) : (
                  <p className="text-slate-500">No flags</p>
                )}
              </div>
            ))}
            {!report.logs.length ? (
              <p className="text-sm text-slate-500">No reports this month yet.</p>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <h3 className="mb-3 text-lg font-semibold">RMO supervisory notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-24 w-full rounded border border-slate-300 p-3 text-sm"
            placeholder="Add notes about this month's supervision…"
          />
        </section>

        <section className="mt-8">
          <h3 className="mb-2 text-lg font-semibold">Digital signature</h3>
          <p className="mb-2 text-sm text-slate-600">
            Sign below to certify this audit report.
          </p>
          <SignatureCanvas
            ref={(ref) => {
              signatureRef.current = ref;
            }}
            canvasProps={{
              width: 500,
              height: 120,
              className: 'border-2 border-slate-400 rounded max-w-full bg-white'
            }}
          />
          <button
            type="button"
            onClick={() => signatureRef.current?.clear()}
            className="mt-2 text-sm text-teal-800 hover:underline"
          >
            Clear signature
          </button>
        </section>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={signAndSubmit}
          className="rounded bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Sign & submit report
        </button>
        <button
          type="button"
          onClick={downloadPdf}
          className="rounded bg-[#0f2a2a] px-5 py-2 text-sm font-semibold text-white hover:bg-[#163838]"
        >
          Download PDF
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
    </AppShell>
  );
}

export default function AuditReportPage({ userName }: { userName: string }) {
  return (
    <Suspense
      fallback={
        <AppShell mode="RMO" name={userName}>
          <p>Loading…</p>
        </AppShell>
      }
    >
      <AuditReportInner userName={userName} />
    </Suspense>
  );
}
