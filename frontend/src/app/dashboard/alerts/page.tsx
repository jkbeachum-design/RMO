import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import AlertsClient from './AlertsClient';

export default function AlertsPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');
  return <AlertsClient userName={session.name} />;
}
