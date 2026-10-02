# RMO Compliance

Compliance automation for California RMOs: Retell voice check-ins → Claude extraction → rule engine → Supabase audit trail → Next.js dashboard.

**Product name:** RMO Compliance  
**Clients in DB:** Beachum Construction (#836089), Vanguard Property Maintenance (#1160775)

## Repo layout

| Path | Purpose |
|------|---------|
| `src/server.js` | Express backend (Retell webhook, Claude, rules, Supabase) |
| `frontend/` | Next.js RMO dashboard + Operator PWA |
| `supabase/migrations/` | Schema / RLS migrations |
| `docs/AUTH.md` | Auth, membership, env, verification |
| `docs/ALERTS.md` | Inbox + critical alerts |
| `docs/PORTFOLIO.md` | Firm portfolio / 3-firm / 90-day clocks |
| `docs/EXPORT.md` | Audit defense PDF + ZIP export |
| `docs/RULES.md` | Configurable rules + digests |
| `docs/ROLES.md` | Roles matrix + company onboarding |
| `docs/RETELL.md` | Retell webhook + publish deprecation notes |
| `docs/OFFLINE_PWA.md` | Operator install + airplane-mode dogfood |
| `vercel.json` | Backend Vercel config |

## Backend

```bash
npm install
cp .env.example .env   # fill secrets
npm run dev            # http://localhost:3001
```

Production: https://temporary-speedy-ochre-5dx4e3g.vercel.app  
Retell webhook: `/api/webhooks/retell` · event `call_ended` · **requires** `RETELL_WEBHOOK_SECRET`

## Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

**Auth:** Supabase Auth (email/password) + HMAC-signed `rmo_session` cookies + `user_licenses` company isolation. See [docs/AUTH.md](docs/AUTH.md).

**Operator intake:** Voice dial-in or structured PWA form (`/operator/submit-report`) with multi-project fields, per-sub COI uploads, membership-scoped history edits, and offline draft queue (see [docs/OFFLINE_PWA.md](docs/OFFLINE_PWA.md)).

**Operator dial-in:** +1 (916) 848-5224

## Environment

Backend `.env`: `SUPABASE_URL`, `SUPABASE_KEY` (service_role), `ANTHROPIC_API_KEY`, `RETELL_WEBHOOK_SECRET`

Frontend `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_KEY`, `SESSION_SECRET`, `BACKEND_URL`, `RETELL_WEBHOOK_SECRET`  
(`PILOT_PASSWORD` is deprecated — do not set.)

## Tests

```bash
npm test
```

## Database

Apply `supabase/migrations/001_auth_company_isolation.sql` before multi-user production.

- After **Oct 30, 2026**, new `public` tables need explicit Data API `GRANT`s (`anon` / `authenticated` / `service_role`) or they are unreachable via PostgREST. Pattern and template: [`supabase/README.md`](supabase/README.md). Existing live tables already have grants.
