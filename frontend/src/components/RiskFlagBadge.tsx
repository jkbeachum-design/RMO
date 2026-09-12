'use client';

import type { RiskFlag, RiskFlags } from '@/lib/types';

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 border-red-300',
  HIGH: 'bg-amber-100 text-amber-900 border-amber-300',
  MEDIUM: 'bg-sky-100 text-sky-900 border-sky-300',
  INFO: 'bg-slate-100 text-slate-700 border-slate-300'
};

export function RiskFlagBadge({ flag }: { flag: RiskFlag | string }) {
  if (typeof flag === 'string') {
    return (
      <span className="inline-flex items-center rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
        {flag}
      </span>
    );
  }

  const style = SEVERITY_STYLES[flag.severity || 'INFO'] || SEVERITY_STYLES.INFO;

  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${style}`}
      title={flag.reason}
    >
      {flag.flag}
    </span>
  );
}

export function RiskFlagList({ riskFlags }: { riskFlags: RiskFlags | null | undefined }) {
  const flags = riskFlags?.raw_flags || [];
  if (!flags.length) {
    return <span className="text-sm text-slate-500">No flags</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f, i) => (
        <RiskFlagBadge key={`${f.flag}-${i}`} flag={f} />
      ))}
    </div>
  );
}
