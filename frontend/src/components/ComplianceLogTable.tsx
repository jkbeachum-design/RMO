'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import type { ComplianceLog } from '@/lib/types';
import { RiskFlagList } from './RiskFlagBadge';

export default function ComplianceLogTable({ logs }: { logs: ComplianceLog[] }) {
  if (!logs.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-slate-500">
        No compliance logs yet. Logs appear here when CEOs submit reports.
      </div>
    );
  }

  return (
    <>
      {/* Mobile stacked cards */}
      <ul className="space-y-3 md:hidden">
        {logs.map((log) => {
          const project = log.extracted_data?.projects?.[0];
          const when = log.call_timestamp || log.created_at;
          const value =
            project?.contract_value != null
              ? `$${Number(project.contract_value).toLocaleString()}`
              : null;
          return (
            <li key={log.id}>
              <Link
                href={`/dashboard/${log.id}`}
                className="block border border-slate-200 bg-white p-4 hover:border-teal-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {format(new Date(when), 'MMM d, yyyy h:mm a')}
                    </p>
                    <p className="mt-1 truncate font-medium text-slate-900">
                      {project?.address || '—'}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {log.extracted_data?.operator_name || '—'}
                      {value ? ` · ${value}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-teal-800">View</span>
                </div>
                <div className="mt-3">
                  <RiskFlagList riskFlags={log.risk_flags} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">CEO</th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Value</th>
              <th className="px-4 py-3 font-medium">Flags</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const project = log.extracted_data?.projects?.[0];
              const when = log.call_timestamp || log.created_at;
              return (
                <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {format(new Date(when), 'MMM d, yyyy h:mm a')}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {log.extracted_data?.operator_name || '—'}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-800">
                    {project?.address || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-800">
                    {project?.contract_value != null
                      ? `$${Number(project.contract_value).toLocaleString()}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <RiskFlagList riskFlags={log.risk_flags} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/${log.id}`}
                      className="font-medium text-teal-800 hover:text-teal-950 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
