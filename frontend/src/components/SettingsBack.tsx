import Link from 'next/link';

export default function SettingsBack({ href }: { href: string }) {
  return (
    <Link href={href} className="mb-3 inline-flex items-center gap-1 py-2 text-sm text-teal-800 hover:underline">
      ‹ Settings
    </Link>
  );
}
