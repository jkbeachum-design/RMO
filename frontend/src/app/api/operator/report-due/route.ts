import { NextResponse } from 'next/server';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import { getOperatorDueBanner } from '@/lib/reportReminders';

/** Banner payload for signed-in operators when a report is due soon or overdue. */
export async function GET() {
  const session = getSession();
  if (!session || session.mode !== 'OPERATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const live = await refreshSessionMemberships(session);
    const status = await getOperatorDueBanner({
      userId: live.userId,
      licenseIds: live.licenseIds || []
    });
    return NextResponse.json(status);
  } catch (err) {
    console.warn('report-due status failed:', err);
    return NextResponse.json({
      due: false,
      overdue: false,
      dueDate: null,
      daysUntil: null,
      daysOverdue: null,
      label: null,
      companyName: null,
      licenseNumber: null
    });
  }
}
