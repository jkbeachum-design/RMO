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

        <div className="mt-8 border border-teal-800/20 bg-teal-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Not sure which to use?</p>
          <p className="mt-1">
            <strong>Call</strong> if you&apos;re on a job site (quick, hands-free).
            <br />
            <strong>Submit form</strong> if you&apos;re in the office (detailed docs + uploads).
          </p>
        </div>
      </div>
    </AppShell>
  );
}
