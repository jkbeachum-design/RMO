import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import RmoSignupClient from './RmoSignupClient';

export default function PublicOnboardingPage() {
  const session = getSession();
  if (session) {
    redirect(session.mode === 'OPERATOR' ? '/operator' : '/dashboard/onboarding');
  }
  return <RmoSignupClient />;
}
