'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import {
  ALL_ROLES,
  CAPABILITY_LABELS,
  ROLE_DEFINITIONS,
  type Capability,
  type RoleDefinition
} from '@/lib/roles';
import type { UserRole } from '@/lib/types';

type LicenseOption = {
  id: string;
  license_number?: string;
  entity_name?: string;
};

type Member = {
  id: string;
  user_id: string;
  role: UserRole;
  email?: string | null;
  name?: string | null;
};

type Invite = { id: string; email: string; role: UserRole; status: string };

const CAPABILITIES = Object.keys(CAPABILITY_LABELS) as Capability[];

export default function RolesClient({ userName }: { userName: string }) {
  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [licenseId, setLicenseId] = useState('');
  const [matrix, setMatrix] = useState<RoleDefinition[]>(ROLE_DEFINITIONS);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('OPERATOR');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (id?: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = id ? `?licenseId=${encodeURIComponent(id)}` : '';
      const res = await fetch(`/api/roles${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load roles');
      setLicenses(data.licenses || []);
      setLicenseId(data.license_id || id || '');
      setMatrix(data.matrix || ROLE_DEFINITIONS);
      setMembers(data.members || []);
      setInvites(data.invites || []);
      setCanManage(Boolean(data.can_manage));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!licenseId || !email) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'invite',
          licenseId,
          email,
          name: name || undefined,
          role
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.hint || 'Failed to add member');
      setEmail('');
      setName('');
      setMessage(
        data.temporary_password
          ? `Member added. Temporary password: ${data.temporary_password}`
          : 'Member added / invited.'
      );
      await load(licenseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function onChangeRole(membershipId: string, next: UserRole) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_role',
          licenseId,
          membershipId,
          role: next
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      await load(licenseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function onRemove(membershipId: string) {
    if (!confirm('Remove this membership?')) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', licenseId, membershipId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Remove failed');
      await load(licenseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell mode="RMO" name={userName}>
      <div className="space-y-10">
        <header>
          <h1 className="font-serif text-3xl text-slate-900">Roles & team</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Beyond RMO/Operator: ADMIN shares the RMO dashboard; PM and Foreman use the Operator
            PWA. Membership is always company-scoped.
          </p>
        </header>

        {error ? (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-900">
            {message}
          </p>
        ) : null}

        <label className="block text-sm">
          <span className="text-slate-600">Company</span>
          <select
            className="mt-1 block w-full max-w-md rounded border border-slate-300 px-3 py-2"
            value={licenseId}
            onChange={(e) => {
              setLicenseId(e.target.value);
              void load(e.target.value);
            }}
          >
            {licenses.map((l) => (
              <option key={l.id} value={l.id}>
                {l.license_number} — {l.entity_name}
              </option>
            ))}
          </select>
        </label>

        <section className="space-y-3">
          <h2 className="font-serif text-xl text-slate-900">Permission matrix</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Capability</th>
                  {matrix.map((r) => (
                    <th key={r.role} className="px-2 py-2 font-medium">
                      {r.role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((cap) => (
                  <tr key={cap} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">{CAPABILITY_LABELS[cap]}</td>
                    {matrix.map((r) => (
                      <td key={r.role} className="px-2 py-2 text-center">
                        {r.capabilities.includes(cap) ? '✓' : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            {matrix.map((r) => (
              <li key={r.role}>
                <span className="font-medium text-slate-800">{r.label}</span> — {r.summary}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="font-serif text-xl text-slate-900">Company team</h2>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium">Role</th>
                    {canManage ? <th className="py-2 font-medium">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3">{m.name || '—'}</td>
                      <td className="py-2 pr-3">{m.email || '—'}</td>
                      <td className="py-2 pr-3">
                        {canManage ? (
                          <select
                            className="rounded border border-slate-300 px-2 py-1"
                            value={m.role}
                            disabled={saving}
                            onChange={(e) =>
                              void onChangeRole(m.id, e.target.value as UserRole)
                            }
                          >
                            {ALL_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          m.role
                        )}
                      </td>
                      {canManage ? (
                        <td className="py-2">
                          <button
                            type="button"
                            className="text-xs text-red-700 hover:underline"
                            disabled={saving}
                            onClick={() => void onRemove(m.id)}
                          >
                            Remove
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {!members.length ? (
                    <tr>
                      <td colSpan={4} className="py-3 text-slate-500">
                        No memberships loaded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          {invites.length ? (
            <div className="text-sm text-slate-600">
              <p className="font-medium text-slate-800">Pending invites</p>
              <ul className="mt-1 space-y-1">
                {invites.map((i) => (
                  <li key={i.id}>
                    {i.email} → {i.role}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canManage ? (
            <form onSubmit={onAdd} className="grid max-w-2xl gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Email
                <input
                  type="email"
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Name (optional)
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Role
                <select
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded bg-[#0f2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#164040] disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Invite / add member'}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-500">
              Only RMO or ADMIN memberships can change the team for this company.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
