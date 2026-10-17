'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { logActivity } from '@/lib/activity';
import { flushQueuedActivityEvents } from '@/lib/offlineQueue';
import { useOnlineStatus } from '@/lib/useOnlineStatus';

/**
 * Mounted on operator AppShell pages. Logs app_open (30m session dedupe)
 * and flushes offline activity when connectivity returns. Never blocks UI.
 */
export default function OperatorActivityLogger() {
  const pathname = usePathname();
  const online = useOnlineStatus();

  useEffect(() => {
    if (!pathname?.startsWith('/operator')) return;
    let cancelled = false;

    (async () => {
      try {
        let licenseNumber: string | null = null;
        try {
          const res = await fetch('/api/me');
          if (res.ok) {
            const data = await res.json();
            const list = (data.licenses || []) as Array<{ license_number?: string }>;
            licenseNumber = list[0]?.license_number || null;
          }
        } catch {
          /* offline — log without license; API will use first membership when flushed */
        }
        if (cancelled) return;
        await logActivity({
          event: 'app_open',
          licenseNumber,
          path: pathname
        });
      } catch {
        /* never break the portal */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      try {
        await flushQueuedActivityEvents();
      } catch {
        /* ignore */
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [online]);

  return null;
}
