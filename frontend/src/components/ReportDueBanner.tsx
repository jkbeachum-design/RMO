'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type DueStatus = {
  due: boolean;
  overdue: boolean;
  dueDate: string | null;
  daysUntil: number | null;
  daysOverdue: number | null;
  label: string | null;
  companyName: string | null;
  licenseNumber: string | null;
};

/**
 * Prominent but non-blocking banner when a required report is due within 3 days or overdue.
 */
export default function ReportDueBanner() {
  const [status, setStatus] = useState<DueStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/operator/report-due')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.due) setStatus(data as DueStatus);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status?.due) return null;

  const company = status.companyName || 'your company';
  const license = status.licenseNumber ? `, CSLB license ${status.licenseNumber}` : '';
  const when = status.overdue
    ? `was due ${status.dueDate} and is ${status.daysOverdue} day${status.daysOverdue === 1 ? '' : 's'} overdue`
    : status.daysUntil === 0
      ? `is due today (${status.dueDate})`
      : `is due in ${status.daysUntil} day${status.daysUntil === 1 ? '' : 's'} (${status.dueDate})`;

  return (
    <div
      className={`mb-4 border px-4 py-3 ${
        status.overdue
          ? 'border-red-400 bg-red-50 text-red-950'
          : 'border-amber-400 bg-amber-50 text-amber-950'
      }`}
      role="status"
    >
      <p className="text-sm font-semibold">
        {status.overdue ? 'Required report past due' : 'Required report due soon'}
      </p>
      <p className="mt-1 text-sm">
        A compliance report {when}. This report is required to maintain RMO compliance for{' '}
        {company}
        {license}.
      </p>
      <Link
        href="/operator/submit-report"
        className={`mt-3 inline-block rounded px-4 py-2 text-sm font-semibold text-white ${
          status.overdue ? 'bg-red-800 hover:bg-red-900' : 'bg-[#0f2a2a] hover:bg-[#163838]'
        }`}
      >
        Start report
      </Link>
    </div>
  );
}
