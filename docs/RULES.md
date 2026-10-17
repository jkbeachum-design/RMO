# Configurable rules & digests

## What this adds (priority #9)

| Need | Implementation |
|------|----------------|
| Configurable rule thresholds | `compliance_settings` per license; Express `loadRuleSettings` + `evaluateComplianceRules(..., settings)` |
| Toggle individual flags | Workers’ comp, unverified subs, expired COI, scope mismatch, missing permit |
| Morning digest | Beyond console `notifyRMO` — summary of open flags / visits / decisions |
| Low-involvement alerts | When no visits, decisions, or reviews for **N days** (default 14) |
| RMO UI | **Rules & digests** → `/dashboard/settings` |

## Migration

Apply `supabase/migrations/005_compliance_settings_digests.sql`:

- `compliance_settings` — thresholds, flag toggles, digest prefs, alert contacts
- `digest_runs` — audit trail of MORNING / LOW_INVOLVEMENT / MANUAL runs
- RLS keyed to `user_has_license_access` / `current_app_user_id`

## API

| Method | Path | Auth |
|--------|------|------|
| GET/PUT | `/api/settings?licenseId=` | RMO session + membership |
| GET | `/api/jobs/digests` | Vercel Cron only — `Authorization: Bearer $CRON_SECRET` (or `DIGEST_SECRET`); unauthenticated → 401 |
| POST | `/api/jobs/digests` | RMO session (membership-scoped MANUAL) **or** `x-cron-secret` / Bearer / `?secret=` matching `CRON_SECRET` / `DIGEST_SECRET` |
| POST | Express `/api/jobs/digests` | Same cron secret (all licenses) |

## Env

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` or `DIGEST_SECRET` | Protect scheduled digest runs |
| `RESEND_API_KEY` / `ALERT_FROM_EMAIL` | Email delivery (else console log) |
| `RMO_ALERT_EMAIL` | Fallback recipient if settings `alert_email` empty |
| `ALERT_EMAIL_ALLOWLIST` / `ALERT_EMAIL_BLOCKLIST` | Pilot recipient filter — see [ALERTS.md](./ALERTS.md) |
| Twilio vars | SMS on Express digest path when `alert_phone` set |

Production schedule is `frontend/vercel.json` → daily `GET /api/jobs/digests` at 14:00 UTC. Manual/secret check:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://rmo.buildmyoffice.com/api/jobs/digests
# or Settings → run digest (POST, RMO session)
```

## Verify

1. Apply migration 005.
2. Open **Rules & digests**, pick a company, lower contract threshold to `1000`, save.
3. Submit a PWA/manual report with contract value `5000` → expect `THRESHOLD_EXCEEDED`.
4. Set low-involvement days to `1`, click **Run digest now** → expect LOW_INVOLVEMENT when no recent supervision/reviews (check server logs if Resend unset).
5. Confirm another user’s company settings/digest cannot be loaded (membership isolation).
6. `npm test` — rules unit tests pass.
