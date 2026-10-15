import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import SettingsBack from '@/components/SettingsBack';
import AccountPanel from '@/components/settings/AccountPanel';
import { getSession } from '@/lib/auth';

export default function RmoAccountPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator/settings');
  return (
    <AppShell mode="RMO" name={session.name}>
      <div className="mx-auto max-w-xl">
        <SettingsBack href="/dashboard/settings" />
        <h1 className="mb-6 font-serif text-3xl">Account</h1>
        <AccountPanel />
      </div>
    </AppShell>
  );
}
