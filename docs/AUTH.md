# Authentication & company isolation

## What changed (priority #1)

| Risk (gap analysis) | Fix |
|---------------------|-----|
| Unsigned forgeable `rmo_session` cookie | HMAC-SHA256 signed session (`SESSION_SECRET`) |
| Dashboard used service-role for all reads | Still server-only service role, but **every** path filters by `user_licenses` membership; browser never gets the key |
| Retell webhook unauthenticated | Shared secret via `Authorization: Bearer` / `x-retell-signature` |
| Operator history hard-locked to `#836089` | Uses first accessible membership (or `?license=`) |
| Single-tenant assumptions | Membership table + no default license authorization |

## Roles

- Account roles on `users.role` and per-company roles on `user_licenses.role`: `RMO`, `OPERATOR`, `ADMIN`, `PM`, `FOREMAN`.
- UI modes: **RMO dashboard** vs **Operator PWA**. Mode switch is only shown when the user has both RMO-class (`RMO`/`ADMIN`) and operator-class (`OPERATOR`/`PM`/`FOREMAN`) memberships.
- Users only see licenses listed in `user_licenses`.
- Team matrix + onboarding: see [ROLES.md](./ROLES.md).

## Env vars

### Backend (root `.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | yes | Postgres API |
| `SUPABASE_KEY` | yes | **service_role** — webhook inserts only; never ship to browser |
| `ANTHROPIC_API_KEY` | yes | Claude extraction |
| `RETELL_WEBHOOK_SECRET` | **yes in production** | Shared secret for Retell + Next.js proxy |
| `RETELL_API_KEY` | fallback | Accepted as webhook secret if `RETELL_WEBHOOK_SECRET` unset |
| `ANTHROPIC_MODEL` | no | default `claude-sonnet-4-6` |
| `PORT` | no | default `3001` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon/publishable key (future RLS clients) |
| `SUPABASE_KEY` | yes | Server-only service role for membership-scoped queries |
| `SESSION_SECRET` | **yes in production** (≥16 chars) | HMAC key for signed cookies |
| `PILOT_PASSWORD` | migration | Bootstrap password for pilot email until hashes set |
| `BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL` | yes for manual submit | Express backend base URL |
| `RETELL_WEBHOOK_SECRET` | yes for manual submit | Forwarded by `/api/operator/submit-report` |

Generate a strong session secret:

```bash
openssl rand -base64 32
```

## Database migration

Apply `supabase/migrations/001_auth_company_isolation.sql` in the Supabase SQL editor:

1. Adds `password_hash`, `auth_user_id`, `is_active` on `users`
2. Creates `user_licenses` membership table
3. Backfills memberships from existing `users.license_id` + pilot RMO email (`jbeachum@buildmyoffice.com`) → Beachum/Vanguard; remaps legacy `jonathan@…` if present. Documents Eric (`ERICJ379@gmail.com`) as ADMIN on Vanguard `#1160775` when that user row exists.
4. Enables RLS policies for defense-in-depth (service role still bypasses for Retell)

## Pilot migration path

1. Apply the SQL migration.
2. Set `SESSION_SECRET`, `RETELL_WEBHOOK_SECRET`, and keep `PILOT_PASSWORD` temporarily.
3. Sign in once as `jbeachum@buildmyoffice.com` (Jonathan Beachum) with the pilot password — bootstrap writes `password_hash` and dual RMO/OPERATOR memberships for both pilot licenses (Beachum `#836089` + Vanguard `#1160775`).
4. Create additional users in `users` + `user_licenses` (or a future invite flow). Set `password_hash` via a small script using the same `scrypt$…` format as `frontend/src/lib/password.ts`. For Vanguard, seed Eric (`ERICJ379@gmail.com`) as `ADMIN` on `#1160775` (company principal); Jonathan remains `RMO` on both licenses.
5. Optional later: set `users.auth_user_id` and switch login to Supabase Auth; RLS helpers already key off `auth.uid()` / JWT email.

## Retell configuration

In the Retell dashboard (or your proxy), send one of:

- `Authorization: Bearer <RETELL_WEBHOOK_SECRET>`
- `x-retell-signature: <RETELL_WEBHOOK_SECRET>`

Manual operator submits go through `POST /api/operator/submit-report` (session + membership required), which attaches the secret server-side. The browser never calls the webhook anonymously.

## Manual verification

1. **Forged cookie**: Set `rmo_session` to base64 JSON of `{email,mode}` → should fail (401 / redirect to login).
2. **Login**: Valid user with membership → dashboard only lists their licenses.
3. **Cross-company**: Request `/dashboard?license=<other_company>` or `/api/logs?license_number=…` for a license not in membership → 403 / denied.
4. **Operator history**: No longer assumes `#836089`; shows membership company.
5. **Webhook**: `POST /api/webhooks/retell` without secret → `401` in production.
6. **Mode switch**: Operator-only account should not see “Switch to RMO”.

## Automated tests

```bash
npm test
```

Covers signed vs forged cookies, password hash verify, membership helper, webhook secret acceptance.
