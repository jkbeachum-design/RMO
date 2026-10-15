import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import SettingsBack from '@/components/SettingsBack';
import { SettingsSection } from '@/components/settings/SettingsUi';
import PhoneAppPanel from '@/components/settings/PhoneAppPanel';
import HelpContact from '@/components/settings/HelpContact';
import { getSession } from '@/lib/auth';

export default function RmoAppPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator/settings');
  return (
    <AppShell mode="RMO" name={session.name}>
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <SettingsBack href="/dashboard/settings" />
          <h1 className="font-serif text-3xl">App &amp; help</h1>
        </div>
        <SettingsSection title="Phone app">
          <PhoneAppPanel showQueue={false} />
        </SettingsSection>
        <SettingsSection title="Help & feedback">
          <HelpContact />
        </SettingsSection>
      </div>
    </AppShell>
  );
}
