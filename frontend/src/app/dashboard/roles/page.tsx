import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import RolesClient from './RolesClient';

export default function RolesPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');
  return <RolesClient userName={session.name} />;
}
