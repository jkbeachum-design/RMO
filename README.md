# RMO Compliance

Compliance automation for California RMOs: Retell voice check-ins → Claude extraction → rule engine → Supabase audit trail → Next.js dashboard.

**Product name:** RMO Compliance  
**Clients in DB:** Beachum Construction (#836089), Vanguard Property Maintenance (#1160775)

## Repo layout

| Path | Purpose |
|------|---------|
| `src/server.js` | Express backend (Retell webhook, Claude, rules, Supabase) |
| `frontend/` | Next.js RMO dashboard + Operator PWA |
| `vercel.json` | Backend Vercel config |

## Backend

```bash
npm install
cp .env.example .env   # fill secrets
npm run dev            # http://localhost:3001
```

Production: https://temporary-speedy-ochre-5dx4e3g.vercel.app  
Retell webhook: `/api/webhooks/retell` · event `call_ended`

## Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # already wired for pilot if using shared secrets
npm run dev                  # http://localhost:3020
```

**Pilot login**
- Email: `jonathan@buildmyoffice.com`
- Password: `rmo-pilot` (override with `PILOT_PASSWORD`)
- Switch between **RMO** and **Operator** modes after login

**Ports (this machine):** homepage `3000`, backend `3001`, Paperless AI `3010`, frontend `3020`

**Operator dial-in:** +1 (916) 848-5224

## Environment

Backend `.env`: `SUPABASE_URL`, `SUPABASE_KEY` (service_role), `ANTHROPIC_API_KEY`, `RETELL_API_KEY`

Frontend `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_KEY`, `PILOT_PASSWORD`, `NEXT_PUBLIC_BACKEND_URL`
