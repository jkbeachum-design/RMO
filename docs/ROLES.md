# Roles matrix & company onboarding

## What this adds (priority #10)

| Need | Implementation |
|------|----------------|
| Roles beyond RMO/OPERATOR | Matrix for `RMO`, `ADMIN`, `PM`, `FOREMAN`, `OPERATOR` |
| Team management | RMO/ADMIN can invite/add/update/remove `user_licenses` rows |
| Company onboarding | Wizard for association docs, ownership, duty statement, bonds/BQI |
| Audit export | Uses stored `licenses.duty_statement` when present |

## Role → UI mode

| Role | Dashboard mode | Typical powers |
|------|----------------|----------------|
| RMO | RMO | Full dashboard, team, onboarding, portfolio, export |
| ADMIN | RMO | Same as RMO for day-to-day ops |
| PM | OPERATOR | Operator PWA + supervision logging |
| FOREMAN | OPERATOR | Operator PWA check-ins/reports |
| OPERATOR | OPERATOR | Operator PWA only |

Capability matrix source of truth: `frontend/src/lib/roles.ts`.

## Migration

Apply `supabase/migrations/006_roles_onboarding.sql` (after 004):

- `licenses.onboarding_completed_at`, `licenses.onboarding_step`
- `company_invites` + RLS

Onboarding fields for ownership/bonds/duty live on `licenses` from migration **004**.

## APIs (membership-scoped)

| Method | Path | Auth |
|--------|------|------|
| GET/POST | `/api/roles` | RMO mode; mutations require RMO/ADMIN on that license |
| GET/PUT | `/api/onboarding` | RMO mode; edits require RMO/ADMIN on that license |

Inviting a new email creates a `users` row with a one-time temporary password (returned once in the API response) and a `company_invites` row when action is `invite`.

## UI

- **Roles** → `/dashboard/roles` — matrix + team roster
- **Onboarding** → `/dashboard/onboarding` — stepped company wizard

## Pilot roster note

- **Jonathan Beachum** (`jbeachum@buildmyoffice.com`) — RMO on Beachum `#836089` and Vanguard `#1160775`
- **Eric** (`ERICJ379@gmail.com`) — company principal / ADMIN on Vanguard `#1160775`

## Verify

1. Apply migrations 004 + 006.
2. Sign in as RMO → open **Roles** → confirm matrix shows ADMIN/PM/FOREMAN/OPERATOR.
3. Invite an OPERATOR email on a membership company → row appears; other companies remain invisible.
4. Open **Onboarding**, fill ownership / duty (≥40 chars) / bond / docs URL → **Mark complete**.
5. Audit export should prefer the saved duty statement.
6. `npm test` — roles unit tests pass.
