import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import RmoSignupClient from './RmoSignupClient';

export default function PublicOnboardingPage() {
  const session = getSession();
  if (process.env.PUBLIC_SIGNUP_ENABLED !== 'true') {
    redirect(session ? (session.mode === 'OPERATOR' ? '/operator' : '/dashboard/onboarding') : '/');
  }
  if (session) {
    redirect(session.mode === 'OPERATOR' ? '/operator' : '/dashboard/onboarding');
  }
  return <RmoSignupClient />;
}
