import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { SettingsSection } from '@/components/settings/SettingsUi';
import AccountPanel from '@/components/settings/AccountPanel';
import MyCompanyPanel from '@/components/settings/MyCompanyPanel';
import PhoneAppPanel from '@/components/settings/PhoneAppPanel';
import HelpContact from '@/components/settings/HelpContact';
import { getSession } from '@/lib/auth';

/** CEO settings. Must never include flags, rules, alerts, team or other RMO-only items. */
export default function CeoSettingsPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'OPERATOR') redirect('/dashboard/settings');
  return (
    <AppShell mode="OPERATOR" name={session.name}>
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="font-serif text-3xl">Settings</h1>
        <nav aria-label="Settings sections" className="flex flex-wrap gap-2 text-sm">
          <a href="#account" className="rounded-full border border-slate-300 bg-white px-3 py-1.5">Account</a>
          <a href="#company" className="rounded-full border border-slate-300 bg-white px-3 py-1.5">My company</a>
          <a href="#phone" className="rounded-full border border-slate-300 bg-white px-3 py-1.5">Phone app</a>
          <a href="#help" className="rounded-full border border-slate-300 bg-white px-3 py-1.5">Help</a>
        </nav>
        <div id="account" className="scroll-mt-4">
          <h2 className="mb-3 text-sm uppercase tracking-wide text-slate-500">Account</h2>
          <AccountPanel />
        </div>
        <div id="company" className="scroll-mt-4">
          <SettingsSection title="My company">
            <MyCompanyPanel />
          </SettingsSection>
        </div>
        <div id="phone" className="scroll-mt-4">
          <SettingsSection title="Phone app">
            <PhoneAppPanel showQueue />
          </SettingsSection>
        </div>
        <div id="help" className="scroll-mt-4">
          <SettingsSection title="Help & feedback">
            <HelpContact />
          </SettingsSection>
        </div>
      </div>
    </AppShell>
  );
}
