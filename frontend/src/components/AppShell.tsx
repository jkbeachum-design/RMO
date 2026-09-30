import Navbar from './Navbar';
import OnlineStatusBanner from './OnlineStatusBanner';
import PendingReportsBanner from './PendingReportsBanner';
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
    <div className="min-h-screen bg-[#f4f6f5] text-slate-900">
      <Navbar mode={mode} name={name} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {showOfflineChrome ? (
          <>
            <OnlineStatusBanner />
            <PendingReportsBanner />
          </>
        ) : null}
        {children}
      </main>
    </div>
  );
}
