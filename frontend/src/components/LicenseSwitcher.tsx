'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

type LicenseOption = {
  license_number: string;
  entity_name: string;
};

export default function LicenseSwitcher({
  licenses,
  current
}: {
  licenses: LicenseOption[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('license', value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-500">Active license</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-300 bg-white px-3 py-2 text-slate-900"
      >
        {licenses.map((l) => (
          <option key={l.license_number} value={l.license_number}>
            {l.entity_name} (#{l.license_number})
          </option>
        ))}
      </select>
    </label>
  );
}
