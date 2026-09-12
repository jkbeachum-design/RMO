import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import PortfolioClient from './PortfolioClient';

export default function PortfolioPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');
  return <PortfolioClient userName={session.name} />;
}
