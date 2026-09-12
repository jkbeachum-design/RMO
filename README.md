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

**Auth:** HMAC-signed session cookies + `user_licenses` company isolation. See [docs/AUTH.md](docs/AUTH.md).

**Operator intake:** Voice dial-in or structured PWA form (`/operator/submit-report`) with multi-project fields, per-sub COI uploads, and membership-scoped history edits.

**Operator dial-in:** +1 (916) 848-5224

## Environment

Backend `.env`: `SUPABASE_URL`, `SUPABASE_KEY` (service_role), `ANTHROPIC_API_KEY`, `RETELL_WEBHOOK_SECRET`

Frontend `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_KEY`, `SESSION_SECRET`, `BACKEND_URL`, `RETELL_WEBHOOK_SECRET`

## Tests

```bash
npm test
```

## Database

Apply `supabase/migrations/001_auth_company_isolation.sql` before multi-user production.
