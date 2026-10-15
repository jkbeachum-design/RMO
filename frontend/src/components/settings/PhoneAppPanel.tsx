'use client';

import { useCallback, useEffect, useState } from 'react';
import { flushAllQueuedReports, listQueuedReports } from '@/lib/offlineQueue';
import { useOnlineStatus } from '@/lib/useOnlineStatus';

type InstallEvent = Event & { prompt: () => Promise<void> };

export default function PhoneAppPanel({ showQueue }: { showQueue: boolean }) {
  const online = useOnlineStatus();
  const [installed, setInstalled] = useState(false);
  const [installEvt, setInstallEvt] = useState<InstallEvent | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [failed, setFailed] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!showQueue) return;
    try {
      const rows = await listQueuedReports();
      setPending(rows.length);
      setFailed(rows.filter((r) => r.status === 'failed').length);
    } catch {
      setPending(0);
    }
  }, [showQueue]);

  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    refresh();
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [refresh]);

  async function retry() {
    setBusy(true);
    setNote('');
    try {
      const r = await flushAllQueuedReports();
      setNote(r.failed ? `Sent ${r.sent}. ${r.failed} still waiting: ${r.errors[0] || 'try again later'}` : `Sent ${r.sent}.`);
    } catch {
      setNote('Could not send right now. Try again when you have signal.');
    }
    setBusy(false);
    refresh();
  }

  return (
    <div className="space-y-3">
      {installed ? (
        <p>✓ Installed on this phone. Open it from the home-screen icon.</p>
      ) : installEvt ? (
        <button type="button" onClick={() => installEvt.prompt()} className="w-full bg-[#0f2a2a] px-4 py-3 font-semibold text-white sm:w-auto">
          Install on this phone
        </button>
      ) : (
        <p>
          To install: open this site in <strong>Chrome</strong>, tap the <strong>three-dot menu</strong>, then{' '}
          <strong>Add to Home screen</strong> (or <strong>Install app</strong>).
        </p>
      )}
      <p className="text-slate-600">
        Connection: <strong>{online ? 'Online' : 'Offline'}</strong>
        {showQueue ? ' — reports you submit offline are saved on this phone and send when you are back online.' : ''}
      </p>
      {showQueue ? (
        <div className="border border-slate-200 bg-slate-50 p-3">
          <p>
            Reports waiting to send: <strong>{pending ?? '…'}</strong>
            {failed ? ` (${failed} need attention)` : ''}
          </p>
          {pending ? (
            <button type="button" disabled={busy || !online} onClick={retry} className="mt-2 w-full border border-slate-300 bg-white px-4 py-3 font-semibold disabled:opacity-50 sm:w-auto">
              {busy ? 'Sending…' : 'Send now'}
            </button>
          ) : null}
          {note ? <p className="mt-2" role="status">{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
