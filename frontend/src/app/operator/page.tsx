import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import {
  COMPLIANCE_PHONE,
  COMPLIANCE_PHONE_DISPLAY
} from '@/lib/constants';
import { getSession } from '@/lib/auth';

export default function OperatorHomePage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'OPERATOR') redirect('/dashboard');

  return (
    <AppShell mode="OPERATOR" name={session.name}>
      <div className="mx-auto max-w-md">
        <p className="text-sm uppercase tracking-wide text-slate-500">Operator check-in</p>
        <h1 className="font-serif text-4xl">RMO Compliance</h1>
        <p className="mt-2 text-slate-600">
          Report projects, subcontractors, and crew status for your RMO audit trail.
        </p>

        <div className="mt-8 space-y-3">
          <a
            href={`tel:${COMPLIANCE_PHONE}`}
            className="block bg-[#0f2a2a] px-4 py-4 text-center text-lg font-semibold text-white hover:bg-[#163838]"
          >
            Call compliance line
            <span className="mt-1 block text-sm font-normal text-teal-100">
              {COMPLIANCE_PHONE_DISPLAY}
            </span>
          </a>

          <a
            href="/operator/submit-report"
            className="block border border-slate-300 bg-white px-4 py-4 text-center font-semibold text-slate-900 hover:bg-slate-50"
          >
            Submit manual report
          </a>

          <a
            href="/operator/history"
            className="block border border-slate-300 bg-white px-4 py-4 text-center font-semibold text-slate-900 hover:bg-slate-50"
          >
            View your reports
          </a>
        </div>
      </div>
    </AppShell>
  );
}
