import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import OnboardingClient from './OnboardingClient';

export default function Page() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator/settings');
  return <OnboardingClient userName={session.name} />;
}
