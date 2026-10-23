'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { displayModeLabel } from '@/lib/labels';
import type { AppMode } from '@/lib/types';

const RMO_LINKS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/inbox', label: 'Inbox' },
  { href: '/dashboard/portfolio', label: 'Portfolio' },
  { href: '/dashboard/projects', label: 'Projects' },
  { href: '/dashboard/subs', label: 'Subs' },
  { href: '/dashboard/supervision', label: 'Supervision' },
  { href: '/dashboard/vault', label: 'Vault' },
  { href: '/dashboard/compliance-log', label: 'Compliance Log' },
  { href: '/dashboard/audit-report', label: 'Monthly Audit' },
  { href: '/dashboard/export', label: 'Export' },
  { href: '/dashboard/settings', label: 'Settings' }
];

const OPERATOR_LINKS = [
  { href: '/operator', label: 'Check-In' },
  { href: '/operator/submit-report', label: 'Manual Report' },
  { href: '/operator/history', label: 'History' },
  { href: '/operator/vault', label: 'Vault' },
  { href: '/operator/projects', label: 'Projects' },
  { href: '/operator/subs', label: 'Subs' },
  { href: '/operator/settings', label: 'Settings' }
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [menuOpen]);

  function isActive(href: string) {
    return (
      pathname === href ||
      (href !== '/dashboard' && href !== '/operator' && pathname.startsWith(href))
    );
  }

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
    <header ref={menuRef} className="relative z-30 border-b border-slate-200 bg-[#0f2a2a] text-white">
      <div className="mx-auto flex max-w-6xl min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-3 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <button
            type="button"
            className="-ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-teal-50 hover:bg-white/10 xl:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="phone-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            )}
          </button>
          <Link
            href={mode === 'RMO' ? '/dashboard' : '/operator'}
            className="min-w-0 truncate font-serif text-lg tracking-tight sm:text-xl"
          >
            RMO Compliance
          </Link>
          {/* Desktop nav only when all RMO links can fit (~xl); avoid sm: single-row overflow */}
          <nav className="hidden gap-1 xl:flex">
            {links.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded px-2.5 py-1.5 text-sm ${
                    active ? 'bg-white/15 text-white' : 'text-teal-100 hover:bg-white/10'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-sm">
          <span className="hidden max-w-[10rem] truncate text-teal-100 lg:inline">{name}</span>
          <span className="rounded bg-white/10 px-2 py-1 text-xs uppercase tracking-wide">
            {displayModeLabel(mode)}
          </span>
          {canSwitch ? (
            <button
              type="button"
              onClick={switchMode}
              className="rounded border border-white/25 px-2.5 py-1.5 text-xs text-teal-50 hover:bg-white/10"
            >
              <span className="sm:hidden">Switch</span>
              <span className="hidden sm:inline">Switch to {mode === 'RMO' ? 'CEO' : 'RMO'}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={logout}
            className="rounded bg-white px-2.5 py-1.5 text-xs font-medium text-[#0f2a2a] hover:bg-teal-50"
          >
            Log out
          </button>
        </div>
      </div>
      {menuOpen ? (
        <nav
          id="phone-nav"
          aria-label={mode === 'RMO' ? 'RMO menu' : 'CEO menu'}
          className="absolute inset-x-0 top-full max-h-[75vh] overflow-y-auto border-t border-white/10 bg-[#0f2a2a] pb-3 shadow-lg xl:hidden"
        >
          <p className="px-4 pb-1 pt-3 text-xs uppercase tracking-wide text-teal-200">
            {name} · {displayModeLabel(mode)}
          </p>
          <ul>
            {links.map((link) => {
              const active = isActive(link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`block px-4 py-3.5 text-base ${
                      active ? 'bg-white/15 font-semibold text-white' : 'text-teal-50 hover:bg-white/10'
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
