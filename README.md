# Vanguard RMO Copilot — Backend

Node.js / Express service that receives Retell `call_ended` webhooks, extracts structured compliance data with Claude, runs the rule engine, and writes audit records to Supabase.

## Stack

- Express on Vercel (`@vercel/node`)
- Supabase Postgres (`licenses`, `users`, `projects`, `subcontractors`, `compliance_logs`)
- Anthropic Claude for transcript → JSON extraction
- Retell AI voice agent (inbound compliance calls)

## Quick start

```bash
cp .env.example .env
# Fill SUPABASE_KEY (service_role) and RETELL_API_KEY
# ANTHROPIC_API_KEY can be reused from go-fer

npm install
npm run dev
```

Health check:

```bash
curl http://localhost:3001/api/health
```

Manual webhook smoke test (flattened payload):

```bash
curl -X POST http://localhost:3001/api/webhooks/retell \
  -H "Content-Type: application/json" \
  -d '{
    "event": "call_ended",
    "call_id": "test-local-001",
    "transcript": "Hi, this is Jon Beachum reporting for Beachum Construction license 836089. We are working at Yi Law Group, about a 400K contract, with plumbing, electrical, and flooring subcontractors. No permits pulled yet. Everything is subcontractors, no direct employees."
  }'
```

Retell’s real payload nests fields under `call` — the handler accepts both shapes.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Liveness + env configuration status |
| `POST` | `/api/webhooks/retell` | Retell `call_ended` ingestion |

## Rule flags

| Flag | Severity | Condition |
|------|----------|-----------|
| `WORKERS_COMP_VIOLATION` | CRITICAL | Direct employees + license `EXEMPT` |
| `THRESHOLD_EXCEEDED` | HIGH | Project contract value > $10,000 |
| `UNVERIFIED_SUBCONTRACTOR` | MEDIUM | Sub `cslb_verified` false / missing |
| `EXPIRED_COI` | HIGH | COI date before today |
| `SCOPE_MISMATCH` | MEDIUM | B-General without framing and &lt; 3 trades |
| `MISSING_PERMIT` | MEDIUM | > $10k job with no permit number |

## Deploy to Vercel

1. Push this repo to GitHub (`vanguard-backend`).
2. Import the repo in Vercel.
3. Set environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_KEY` (**service_role**, not anon)
   - `ANTHROPIC_API_KEY`
   - `RETELL_API_KEY`
   - `NODE_ENV=production`
4. Deploy and note the URL, e.g. `https://vanguard-backend-xyz.vercel.app`.
5. In Retell → Agent → Webhooks, set:
   - URL: `https://vanguard-backend-xyz.vercel.app/api/webhooks/retell`
   - Event: `call_ended`

## Pilot licenses

- Beachum Construction `#836089` (test) — Jon as RMO + OPERATOR
- Vanguard Property Maintenance Inc. `#1160775` (production) — Jon as RMO

`compliance_month` is bucketed in `America/Los_Angeles`.

## Notes

- Webhook processing is synchronous (extract + write). Retell times out at ~10s; if Claude is slow, Retell may retry. Make the consumer idempotent later via `retell_call_id`.
- RMO notification (`notifyRMO`) is a console stub for the pilot — dashboard review is the MVP path.
- Do not commit `.env`. Use `.env.example` as the template.
