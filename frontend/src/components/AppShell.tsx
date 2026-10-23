import Navbar from './Navbar';
import OnlineStatusBanner from './OnlineStatusBanner';
import PendingReportsBanner from './PendingReportsBanner';
import OperatorActivityLogger from './OperatorActivityLogger';
import ReportDueBanner from './ReportDueBanner';
import HelpChat from './HelpChat';
import type { AppMode } from '@/lib/types';

export default function AppShell({
  mode,
  name,
  children,
  showOfflineChrome = mode === 'OPERATOR'
}: {
  mode: AppMode;
  name: string;
  children: React.ReactNode;
  /** Operator pages get online/offline + pending-queue chrome. Dashboard stays untouched. */
  showOfflineChrome?: boolean;
}) {
  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-[#f4f6f5] text-slate-900">
      <Navbar mode={mode} name={name} />
      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-24 pt-8">
        {showOfflineChrome ? (
          <>
            <OperatorActivityLogger />
            <ReportDueBanner />
            <OnlineStatusBanner />
            <PendingReportsBanner />
          </>
        ) : null}
        {children}
      </main>
      <HelpChat mode={mode} />
    </div>
  );
}
