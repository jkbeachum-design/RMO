import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import AuditReportClient from './AuditReportClient';

export default function AuditReportPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');
  return <AuditReportClient userName={session.name} />;
}
