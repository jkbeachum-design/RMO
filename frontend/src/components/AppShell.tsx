import Navbar from './Navbar';
import type { AppMode } from '@/lib/types';

export default function AppShell({
  mode,
  name,
  children
}: {
  mode: AppMode;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f4f6f5] text-slate-900">
      <Navbar mode={mode} name={name} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
