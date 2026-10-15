'use client';

import { useEffect, useState } from 'react';

type Company = {
  name: string | null;
  license_number: string | null;
  rmos: Array<{ name: string; email: string; phone: string | null }>;
};

export default function MyCompanyPanel() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch('/api/account')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d ? setCompanies(d.companies || []) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <p>Could not load company details. Check your connection and try again.</p>;
  if (!companies) return <p className="text-slate-500">Loading…</p>;
  if (!companies.length) return <p>No company is linked to your account. Contact your RMO.</p>;
  return (
    <div className="space-y-4">
      {companies.map((c, i) => (
        <div key={i} className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
          <p className="font-semibold text-slate-900">{c.name || 'Company'}</p>
          <p>CSLB license {c.license_number || '—'}</p>
          {c.rmos.map((r, j) => (
            <div key={j} className="mt-2">
              <p>
                RMO: <strong>{r.name}</strong>
              </p>
              <p className="flex flex-wrap gap-x-4">
                {r.phone ? <a className="text-teal-800 underline" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a> : null}
                <a className="break-all text-teal-800 underline" href={`mailto:${r.email}`}>{r.email}</a>
              </p>
            </div>
          ))}
          <p className="mt-2 text-xs text-slate-500">Company details are managed by your RMO.</p>
        </div>
      ))}
    </div>
  );
}
