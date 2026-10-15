import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import RolesClient from './RolesClient';

export default function Page() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator/settings');
  return <RolesClient userName={session.name} />;
}
