# Alerts & needs-review inbox

## Inbox

- RMO nav: **Inbox** → `/dashboard/inbox`
- Shows unreviewed compliance logs for membership-scoped licenses
- Filters: All open / Critical / Flagged
- Dashboard tile **Needs review** links into the inbox

## Critical flag alerts

When the rule engine raises `critical_flags`, Express `notifyRMO`:

1. Resolves contacts from `user_licenses` (RMO/ADMIN), optional `licenses.alert_email` / `alert_phone`, and env fallbacks
2. Sends email via **Resend** if `RESEND_API_KEY` is set
3. Sends SMS via **Twilio** if Twilio env vars are set
4. Always logs to console (safe default when providers unset)

### Env (backend)

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Email via Resend |
| `ALERT_FROM_EMAIL` | From header |
| `RMO_ALERT_EMAIL` | Comma-separated fallback recipients |
| `RMO_ALERT_PHONE` | Comma-separated E.164 phones |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS |
| `DASHBOARD_URL` | Link included in email body |

## Verify

1. Create/unreview a log → appears in Inbox
2. Mark reviewed on log detail → leaves Inbox
3. Trigger critical flag without provider keys → see `ALERT:` in server logs
4. With Resend/Twilio configured → message delivered to RMO contacts
