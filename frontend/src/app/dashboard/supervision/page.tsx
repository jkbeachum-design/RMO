import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import SupervisionClient from './SupervisionClient';

export default function SupervisionPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (session.mode !== 'RMO') redirect('/operator');
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f6f5]" />}>
      <SupervisionClient userName={session.name} />
    </Suspense>
  );
}
