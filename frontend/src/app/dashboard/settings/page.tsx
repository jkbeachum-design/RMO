import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { SettingsRow } from '@/components/settings/SettingsUi';
import { getSession } from '@/lib/auth';

export default function RmoSettingsPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator/settings');
  return (
    <AppShell mode="RMO" name={session.name}>
      <div className="mx-auto max-w-xl">
        <h1 className="font-serif text-3xl">Settings</h1>
        <div className="mt-6 border border-slate-200">
          <SettingsRow href="/dashboard/settings/account" title="Account" desc="Name, phone, change password, log out" />
          <SettingsRow href="/dashboard/settings/notifications" title="Notifications" desc="Phone (ntfy) and email alerts when a CEO submits a report" />
          <SettingsRow href="/dashboard/settings/rules" title="Compliance rules" desc="Flag thresholds and low-involvement window" />
          <SettingsRow href="/dashboard/settings/companies" title="Companies & licenses" desc="Add or edit companies you qualify" />
          <SettingsRow href="/dashboard/settings/team" title="Team & CEOs" desc="Add CEOs, roles, remove someone from a license" />
          <SettingsRow href="/dashboard/settings/app" title="App & help" desc="Install on your phone, Help, contact" />
        </div>
      </div>
    </AppShell>
  );
}
