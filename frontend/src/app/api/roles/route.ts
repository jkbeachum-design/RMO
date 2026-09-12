import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getSession, refreshSessionMemberships } from '@/lib/auth';
import {
  loadMemberships,
  membershipLicenseIds,
  canManageLicenseTeam
} from '@/lib/access';
import { getSupabaseAdmin } from '@/lib/supabase';
import { hashPassword } from '@/lib/password';
import { ALL_ROLES, ROLE_DEFINITIONS } from '@/lib/roles';
import type { UserRole } from '@/lib/types';

async function requireRmo() {
  const session = getSession();
  if (!session || session.mode !== 'RMO') return null;
  return refreshSessionMemberships(session);
}

function isRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (ALL_ROLES as string[]).includes(value);
}

/** Roles matrix + membership roster for accessible companies. */
export async function GET(req: NextRequest) {
  const live = await requireRmo();
  if (!live) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberships = await loadMemberships(live.userId);
  const allowedIds = membershipLicenseIds(memberships);
  if (!allowedIds.length) {
    return NextResponse.json({ error: 'No company memberships' }, { status: 403 });
  }

  const licenseId = req.nextUrl.searchParams.get('licenseId') || allowedIds[0];
  if (!allowedIds.includes(licenseId)) {
    return NextResponse.json({ error: 'Forbidden for license' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: members, error } = await supabase
    .from('user_licenses')
    .select(
      'id, user_id, license_id, role, created_at, users(id, user_email, user_name, role, is_active)'
    )
    .eq('license_id', licenseId)
    .order('created_at', { ascending: true });

  const { data: invites } = await supabase
    .from('company_invites')
    .select('id, email, role, status, expires_at, created_at')
    .eq('license_id', licenseId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });

  const seen = new Set<string>();
  const licenses = [];
  for (const m of memberships) {
    if (seen.has(m.license_id)) continue;
    seen.add(m.license_id);
    licenses.push({
      id: m.license_id,
      license_number: m.licenses?.license_number,
      entity_name: m.licenses?.entity_name,
      my_roles: memberships.filter((x) => x.license_id === m.license_id).map((x) => x.role)
    });
  }

  return NextResponse.json({
    license_id: licenseId,
    licenses,
    matrix: ROLE_DEFINITIONS,
    can_manage: canManageLicenseTeam(memberships, licenseId),
    members: (members || []).map((row) => {
      const u = Array.isArray(row.users) ? row.users[0] : row.users;
      return {
        id: row.id,
        user_id: row.user_id,
        role: row.role as UserRole,
        created_at: row.created_at,
        email: u?.user_email || null,
        name: u?.user_name || null,
        is_active: u?.is_active !== false
      };
    }),
    invites: invites || [],
    error: error?.message || null
  });
}

/**
 * Manage memberships / invites.
 * body.action: add | update_role | remove | invite
 */
export async function POST(req: NextRequest) {
  const live = await requireRmo();
  if (!live) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const licenseId = String(body.licenseId || body.license_id || '');
  const action = String(body.action || 'add');

  const memberships = await loadMemberships(live.userId);
  if (!licenseId || !membershipLicenseIds(memberships).includes(licenseId)) {
    return NextResponse.json({ error: 'Forbidden for license' }, { status: 403 });
  }
  if (!canManageLicenseTeam(memberships, licenseId)) {
    return NextResponse.json(
      { error: 'Only RMO or ADMIN can manage team memberships' },
      { status: 403 }
    );
  }

  const supabase = getSupabaseAdmin();
  const role = body.role;

  if (action === 'remove') {
    const membershipId = String(body.membershipId || body.id || '');
    if (!membershipId) {
      return NextResponse.json({ error: 'membershipId required' }, { status: 400 });
    }
    const { data: row } = await supabase
      .from('user_licenses')
      .select('id, user_id, role')
      .eq('id', membershipId)
      .eq('license_id', licenseId)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Membership not found' }, { status: 404 });

    if (row.role === 'RMO' || row.role === 'ADMIN') {
      const { data: managers } = await supabase
        .from('user_licenses')
        .select('id')
        .eq('license_id', licenseId)
        .in('role', ['RMO', 'ADMIN']);
      if ((managers || []).length <= 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last RMO/ADMIN for this company' },
          { status: 400 }
        );
      }
    }

    const { error } = await supabase.from('user_licenses').delete().eq('id', membershipId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, removed: membershipId });
  }

  if (!isRole(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  if (action === 'update_role') {
    const membershipId = String(body.membershipId || body.id || '');
    if (!membershipId) {
      return NextResponse.json({ error: 'membershipId required' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('user_licenses')
      .update({ role })
      .eq('id', membershipId)
      .eq('license_id', licenseId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, membership: data });
  }

  const email = String(body.email || '')
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  let { data: user } = await supabase
    .from('users')
    .select('id, user_email, user_name, password_hash')
    .ilike('user_email', email)
    .maybeSingle();

  let temporaryPassword: string | null = null;
  if (!user) {
    temporaryPassword = randomBytes(9).toString('base64url').slice(0, 12);
    const { data: created, error: createErr } = await supabase
      .from('users')
      .insert([
        {
          user_email: email,
          user_name: body.name || email.split('@')[0],
          role,
          password_hash: hashPassword(temporaryPassword),
          is_active: true,
          license_id: licenseId
        }
      ])
      .select('id, user_email, user_name, password_hash')
      .single();
    if (createErr || !created) {
      return NextResponse.json(
        { error: createErr?.message || 'Failed to create user' },
        { status: 500 }
      );
    }
    user = created;
  }

  if (action === 'invite') {
    const token = randomBytes(24).toString('hex');
    const { data: invite, error: inviteErr } = await supabase
      .from('company_invites')
      .insert([
        {
          license_id: licenseId,
          invited_by: live.userId,
          email,
          role,
          token,
          status: 'PENDING'
        }
      ])
      .select()
      .single();
    if (inviteErr) {
      return NextResponse.json(
        {
          error: inviteErr.message,
          hint: 'Apply supabase/migrations/006_roles_onboarding.sql'
        },
        { status: 500 }
      );
    }
    await supabase.from('user_licenses').upsert(
      [{ user_id: user.id, license_id: licenseId, role }],
      { onConflict: 'user_id,license_id,role' }
    );
    return NextResponse.json({
      ok: true,
      invite,
      temporary_password: temporaryPassword,
      user_id: user.id
    });
  }

  const { data: membership, error } = await supabase
    .from('user_licenses')
    .upsert([{ user_id: user.id, license_id: licenseId, role }], {
      onConflict: 'user_id,license_id,role'
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    membership,
    temporary_password: temporaryPassword,
    user_id: user.id
  });
}
