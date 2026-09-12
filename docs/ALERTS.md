# Alerts & needs-review inbox

## Inbox

- RMO nav: **Inbox** → `/dashboard/inbox`
- Shows unreviewed compliance logs for membership-scoped licenses
- Filters: All open / Critical / Flagged
- Dashboard tile **Needs review** links into the inbox

## Critical flag alerts

When the rule engine raises `critical_flags`, Express `notifyRMO`:

1. Resolves contacts from `user_licenses` (RMO/ADMIN), optional `licenses.alert_email` / `alert_phone`, and env fallbacks
2. **Filters** every recipient through the central allowlist/blocklist helper (`src/alertRecipients.js`)
3. Sends email via **Resend** if `RESEND_API_KEY` is set
4. Sends SMS via **Twilio** if Twilio env vars are set
5. Always logs to console (safe default when providers unset)

### Env (backend)

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Email via Resend |
| `ALERT_FROM_EMAIL` | From header |
| `RMO_ALERT_EMAIL` | Comma-separated fallback recipients |
| `RMO_ALERT_PHONE` | Comma-separated E.164 phones |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS |
| `DASHBOARD_URL` | Link included in email body |
| `ALERT_EMAIL_ALLOWLIST` | When set/non-empty, **only** these emails may receive mail (comma-separated) |
| `ALERT_EMAIL_BLOCKLIST` | Extra blocked emails (comma-separated); merged with hard-coded pilot block |
| `ALERT_PHONE_ALLOWLIST` | When set/non-empty, **only** these phones may receive SMS |
| `ALERT_PHONE_BLOCKLIST` | Extra blocked phones (comma-separated) |

## Testing safety (pilot)

Outbound Resend email and Twilio SMS are gated by a **permanent** recipient filter. Product roles (e.g. ADMIN on Vanguard) are unchanged — filtering is the guard; allowlist is the testing switch.

### Hard-coded email block

`ERICJ379@gmail.com` (any case) is **always** blocklisted in code, even if `ALERT_EMAIL_BLOCKLIST` is unset. Eric’s user account and ADMIN membership stay in place; he simply cannot be emailed or used as a digest recipient until explicitly removed from the hard-coded list (not via env alone for this address — env can only add more blocks).

### Recommended pilot allowlist

Set in backend (and Next.js for digest routes):

```bash
ALERT_EMAIL_ALLOWLIST=jbeachum@buildmyoffice.com
```

When `ALERT_EMAIL_ALLOWLIST` is non-empty, **only** listed addresses receive mail. Jonathan is the intended test recipient. Anyone else resolved from `user_licenses`, license alert fields, or `RMO_ALERT_EMAIL` is dropped.

### Phone SMS

- `ALERT_PHONE_ALLOWLIST` — when set, only those E.164 numbers are texted
- `ALERT_PHONE_BLOCKLIST` — always filtered
- Prefer enable phone allowlist during testing so unknown principals are never SMS’d

### Logging

Blocked recipients are logged clearly:

```text
ALERT recipient blocked: ericj379@gmail.com (blocklist)
ALERT recipient blocked: someone@example.com (allowlist)
ALERT SMS recipient blocked: +15551212 (allowlist)
```

### Code paths covered

| Path | Filter application |
|------|--------------------|
| Express `resolveRmoContacts` / `notifyRMO` | Filtered before send |
| Express `sendEmailAlert` / `sendSmsAlert` | Last-line filter on every call |
| Express `POST /api/jobs/digests` | Filters settings + contacts |
| Next `POST /api/jobs/digests` | Filters via same helper before Resend |

## Digests (priority #9)

Morning digest + low-involvement alerts are configured under **Rules & digests** (`/dashboard/settings`). See [RULES.md](./RULES.md). Digest recipients use the same allowlist/blocklist rules as critical alerts.

## Verify

1. Create/unreview a log → appears in Inbox
2. Mark reviewed on log detail → leaves Inbox
3. Trigger critical flag without provider keys → see `ALERT:` in server logs
4. With Resend/Twilio configured → message delivered only to allowlisted (and not blocklisted) contacts
5. With Eric as ADMIN and `ALERT_EMAIL_ALLOWLIST=jbeachum@buildmyoffice.com` → console shows Eric blocked; Jonathan still receives mail
6. Run digest from Settings or `POST /api/jobs/digests` → console/email summary + optional low-involvement alert (filtered)
