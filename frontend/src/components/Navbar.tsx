'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AppMode } from '@/lib/types';

const RMO_LINKS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/inbox', label: 'Inbox' },
  { href: '/dashboard/portfolio', label: 'Portfolio' },
  { href: '/dashboard/projects', label: 'Projects' },
  { href: '/dashboard/supervision', label: 'Supervision' },
  { href: '/dashboard/vault', label: 'Vault' },
  { href: '/dashboard/compliance-log', label: 'Compliance Log' },
  { href: '/dashboard/audit-report', label: 'Monthly Audit' },
  { href: '/dashboard/export', label: 'Export' }
];

const OPERATOR_LINKS = [
  { href: '/operator', label: 'Check-In' },
  { href: '/operator/submit-report', label: 'Manual Report' },
  { href: '/operator/history', label: 'History' }
];

export default function Navbar({
  mode,
  name
}: {
  mode: AppMode;
  name: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const links = mode === 'RMO' ? RMO_LINKS : OPERATOR_LINKS;
  const [canSwitch, setCanSwitch] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.memberships) return;
        const roles = new Set((data.memberships as Array<{ role: string }>).map((m) => m.role));
        const hasRmo = roles.has('RMO') || roles.has('ADMIN');
        const hasOp = roles.has('OPERATOR') || roles.has('FOREMAN') || roles.has('PM');
        setCanSwitch(hasRmo && hasOp);
      })
      .catch(() => setCanSwitch(false));
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  async function switchMode() {
    const next = mode === 'RMO' ? 'OPERATOR' : 'RMO';
    const res = await fetch('/api/auth/switch-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: next })
    });
    if (!res.ok) return;
    router.push(next === 'RMO' ? '/dashboard' : '/operator');
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-[#0f2a2a] text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href={mode === 'RMO' ? '/dashboard' : '/operator'} className="font-serif text-xl tracking-tight">
            RMO Compliance
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {links.map((link) => {
              const active = pathname === link.href || (link.href !== '/dashboard' && link.href !== '/operator' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded px-3 py-1.5 text-sm ${
                    active ? 'bg-white/15 text-white' : 'text-teal-100 hover:bg-white/10'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-teal-100 md:inline">{name}</span>
          <span className="rounded bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide">
            {mode === 'RMO' ? 'RMO' : 'Operator'}
          </span>
          {canSwitch ? (
            <button
              type="button"
              onClick={switchMode}
              className="rounded border border-white/25 px-2.5 py-1 text-xs text-teal-50 hover:bg-white/10"
            >
              Switch to {mode === 'RMO' ? 'Operator' : 'RMO'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={logout}
            className="rounded bg-white px-2.5 py-1 text-xs font-medium text-[#0f2a2a] hover:bg-teal-50"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
