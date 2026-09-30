'use client';

import { useOnlineStatus } from '@/lib/useOnlineStatus';

export default function OnlineStatusBanner({ compact = false }: { compact?: boolean }) {
  const online = useOnlineStatus();

  if (online) {
    return compact ? (
      <p className="text-xs text-emerald-800" role="status">
        Online
      </p>
    ) : null;
  }

  return (
    <div
      role="status"
      className="mb-4 border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950"
    >
      <p className="font-semibold">You’re offline</p>
      <p className="mt-0.5 text-xs opacity-90">
        Operator pages you already opened still work. New reports save on this phone and send when
        you’re back online. File uploads are kept locally when possible — you’ll be asked to
        re-attach anything that couldn’t be stored.
      </p>
    </div>
  );
}
