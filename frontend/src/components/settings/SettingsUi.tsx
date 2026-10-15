import Link from 'next/link';

export function SettingsRow({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 last:border-b-0 hover:bg-slate-50"
    >
      <span>
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-sm text-slate-600">{desc}</span>
      </span>
      <span aria-hidden="true" className="text-xl text-slate-400">›</span>
    </Link>
  );
}

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 text-sm text-slate-700">{children}</div>
    </section>
  );
}
