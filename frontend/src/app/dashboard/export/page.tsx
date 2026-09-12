import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import ExportClient from './ExportClient';

export default function ExportPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');
  return <ExportClient userName={session.name} />;
}
