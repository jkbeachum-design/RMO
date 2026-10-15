import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import RulesClient from './RulesClient';

export default function Page() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator/settings');
  return <RulesClient userName={session.name} />;
}
