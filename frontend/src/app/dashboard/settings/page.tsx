import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import SettingsClient from './SettingsClient';

export default function SettingsPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');
  return <SettingsClient userName={session.name} />;
}
