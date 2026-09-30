'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  flushAllQueuedReports,
  flushQueuedReport,
  listQueuedReports,
  type QueuedReport
} from '@/lib/offlineQueue';
import { useOnlineStatus } from '@/lib/useOnlineStatus';

export default function PendingReportsBanner({
  onFlushed
}: {
  onFlushed?: () => void;
}) {
  const online = useOnlineStatus();
  const [items, setItems] = useState<QueuedReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const refresh = useCallback(async () => {
    try {
      const rows = await listQueuedReports();
      setItems(rows);
      return rows;
    } catch {
      setItems([]);
      return [] as QueuedReport[];
    }
  }, []);

  useEffect(() => {
    refresh();
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      const rows = await listQueuedReports();
      if (cancelled || !rows.length) {
        if (!cancelled) setItems(rows);
        return;
      }
      setItems(rows);
      setBusy(true);
      setNote('Sending saved offline reports…');
      const result = await flushAllQueuedReports();
      if (cancelled) return;
      await refresh();
      if (result.sent) {
        setNote(
          result.failed
            ? `Sent ${result.sent}. ${result.failed} still need attention.`
            : `Sent ${result.sent} saved report${result.sent === 1 ? '' : 's'}.`
        );
        onFlushed?.();
      } else if (result.failed) {
        setNote(result.errors[0] || 'Could not send saved reports yet.');
      } else {
        setNote('');
      }
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only when connectivity flips on — refresh queue then flush.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  if (!items.length && !note) return null;

  async function sendOne(id: string) {
    setBusy(true);
    setNote('');
    const result = await flushQueuedReport(id);
    await refresh();
    if (result.ok) {
      setNote(`Sent report${result.logId ? ` · log ${result.logId}` : ''}.`);
      onFlushed?.();
    } else {
      setNote(result.error);
    }
    setBusy(false);
  }

  return (
    <div className="mb-4 border border-teal-700/30 bg-teal-50 px-3 py-3 text-sm text-slate-800">
      <p className="font-semibold text-teal-950">
        {items.length
          ? `${items.length} report${items.length === 1 ? '' : 's'} saved offline`
          : 'Offline queue'}
      </p>
      {items.length ? (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="border border-teal-800/10 bg-white/70 px-2 py-2">
              <p className="text-xs text-slate-600">
                Saved {new Date(item.createdAt).toLocaleString()} · license #{item.licenseId}
                {item.needsFileReattach ? ' · needs file re-attach' : ''}
                {item.status === 'failed' && item.lastError ? ` · ${item.lastError}` : ''}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !online || item.needsFileReattach}
                  onClick={() => sendOne(item.id)}
                  className="text-xs font-semibold text-teal-900 underline disabled:opacity-50"
                >
                  {online ? 'Send now' : 'Waiting for signal'}
                </button>
                {item.needsFileReattach ? (
                  <a
                    href="/operator/submit-report"
                    className="text-xs font-semibold text-amber-900 underline"
                  >
                    Open form to re-attach
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="mt-2 text-xs text-teal-900">{note}</p> : null}
    </div>
  );
}
