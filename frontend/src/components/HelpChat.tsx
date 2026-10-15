'use client';

import { useEffect, useRef, useState } from 'react';
import type { AppMode } from '@/lib/types';

/** Strip simple markdown (bold/italics/headings/backticks) so answers read as plain text. */
export function plainText(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[*]\s+/gm, '• ')
    .replace(/`([^`]+)`/g, '$1');
}

type Turn = { role: 'user' | 'assistant'; content: string };

export default function HelpChat({ mode }: { mode: AppMode }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const who = mode === 'RMO' ? 'RMO' : 'CEO';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, open]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: q }];
    setTurns(next);
    setInput('');
    setBusy(true);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('offline');
      }
      const res = await fetch('/api/ai/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history: turns })
      });
      const data = await res.json().catch(() => ({}));
      const answer = res.ok ? data.answer : data.error || 'Help is unavailable right now.';
      setTurns([...next, { role: 'assistant', content: answer }]);
    } catch {
      setTurns([
        ...next,
        { role: 'assistant', content: 'Help needs an internet connection. Please try again when you have signal.' }
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open help"
        className="fixed bottom-4 right-4 z-40 rounded-full bg-[#0f2a2a] px-5 py-3 text-base font-semibold text-white shadow-lg hover:bg-[#163838]"
      >
        ? Help
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true">
          <div className="flex h-[85vh] w-full max-w-md flex-col rounded-t-xl bg-white shadow-xl sm:h-[70vh] sm:rounded-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="font-semibold text-slate-900">Help ({who})</p>
              <button type="button" onClick={() => setOpen(false)} className="rounded px-3 py-1 text-lg text-slate-600 hover:bg-slate-100" aria-label="Close help">
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
              {turns.length === 0 ? (
                <p className="text-slate-500">
                  {mode === 'RMO'
                    ? 'Ask how to use the RMO dashboard, e.g. "How do I add a company?"'
                    : 'Ask how to use the CEO portal, e.g. "How do I upload a COI?" or "How do I put this on my phone?"'}
                </p>
              ) : null}
              {turns.map((t, i) => (
                <div
                  key={i}
                  className={`whitespace-pre-wrap rounded-lg px-3 py-2 ${
                    t.role === 'user' ? 'ml-8 bg-teal-50 text-slate-900' : 'mr-8 bg-slate-100 text-slate-800'
                  }`}
                >
                  {t.role === 'assistant' ? plainText(t.content) : t.content}
                </div>
              ))}
              {busy ? <p className="text-slate-400">Thinking…</p> : null}
              <div ref={endRef} />
            </div>
            <form onSubmit={ask} className="flex gap-2 border-t border-slate-200 p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={1000}
                placeholder="Type your question"
                className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-base"
              />
              <button type="submit" disabled={busy || !input.trim()} className="rounded bg-[#0f2a2a] px-4 py-2 font-semibold text-white disabled:opacity-50">
                Ask
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
