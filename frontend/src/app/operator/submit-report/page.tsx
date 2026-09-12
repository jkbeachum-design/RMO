import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import SubmitReportClient from './SubmitReportClient';

export default function SubmitReportPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'OPERATOR') redirect('/dashboard');
  return <SubmitReportClient userName={session.name} />;
}
