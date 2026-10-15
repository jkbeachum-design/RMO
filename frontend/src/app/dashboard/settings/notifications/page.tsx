import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import AlertsClient from './AlertsClient';

export default function Page() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator/settings');
  return <AlertsClient userName={session.name} />;
}
