# RMO Compliance — Project Status

**Product:** RMO Compliance  
**Owner:** Jonathan Beachum (`jbeachum@buildmyoffice.com`)  
**Repo:** [jkbeachum-design/RMO](https://github.com/jkbeachum-design/RMO)  
**Status date:** 2026-09-12  
**Audience:** Internal product / ops snapshot (features + current readiness)

---

## 1. What this is

RMO Compliance helps California **Responsible Managing Officers** organize and automate day-to-day information from company operators, so oversight evidence stays CSLB-aligned (supervision, control, multi-firm limits, bonds/BQI hygiene, audit defense).

**Primary loop (live today):**

1. Operator check-in (voice via Retell **or** structured mobile PWA form)  
2. Claude extracts structured compliance data  
3. Rule engine raises risk flags  
4. Row lands in Supabase `compliance_logs` (projects/subs upserted)  
5. RMO reviews in the dashboard; digests/alerts fire when configured  
6. Monthly audit sign-off + multi-page PDF/ZIP defense export  

**Positioning:** Built first for Jonathan’s own RMO practice; marketed as a B2B SaaS for other California RMOs and multi-firm qualifiers.

---

## 2. Live deployment

| Surface | URL / location | Status |
|---------|----------------|--------|
| **Frontend (production)** | https://rmo.buildmyoffice.com | **Live** (HTTPS, Vercel alias + Cloudflare DNS) |
| **Backend (Express)** | `temporary-speedy-ochre-5dx4e3g.vercel.app` | **Live** (API / Retell webhook) |
| **Custom domain DNS** | Cloudflare → Vercel CNAME for `rmo` | **Done** |
| **Database** | Supabase Postgres + Storage | **Live**; migrations `001`–`006` applied |
| **Operator dial-in** | +1 (916) 848-5224 | **Live** (Retell) |

Vercel projects:

- Frontend: `rmo-compliance-frontend` (Root Directory = `frontend/`)
- Backend: existing Express project (`vercel.json` → `src/server.js`)

---

## 3. Pilot companies & people

| License | Company | Jonathan’s role | Other principal |
|---------|---------|-----------------|-----------------|
| **#836089** | Beachum Construction | Sole proprietor / RMO | — |
| **#1160775** | Vanguard Property Maintenance | RMO | Eric — ADMIN / principal (`ERICJ379@gmail.com`) |

Auth email for Jonathan: **`jbeachum@buildmyoffice.com`** (legacy `jonathan@…` remapped in migration notes).

**Testing safety:** Eric’s email is **hard-blocked** from outbound Resend/Twilio alerts and digests (`src/alertRecipients.js` + `frontend/src/lib/alertRecipients.ts`). Product roles are unchanged. Pilot allowlist: `ALERT_EMAIL_ALLOWLIST=jbeachum@buildmyoffice.com`.

---

## 4. Stack

| Layer | Choice |
|-------|--------|
| Backend | Node.js, Express 5 (`src/server.js`), Vercel Node |
| Frontend | Next.js 14 App Router, React 18, TypeScript, Tailwind |
| AI / voice | Retell webhook (`call_ended`) → Anthropic Claude extraction |
| Rules | Express `evaluateComplianceRules` + per-license `compliance_settings` |
| Database | Supabase (Postgres) + RLS policies (defense in depth) |
| Storage | Supabase Storage bucket `compliance-documents` |
| Auth | HMAC-signed session cookies + `user_licenses` membership |
| Alerts | Resend (email) + Twilio (SMS), gated by allowlist/blocklist |
| PDF / export | Client + server audit PDF; ZIP evidence package |
| PWA | Operator-oriented pages + `manifest.json` |

Repo layout: root Express backend + `frontend/` Next app (not a formal monorepo workspace). Docs live under `docs/`.

---

## 5. Feature inventory & status

Status key:

| Status | Meaning |
|--------|---------|
| **DONE** | Usable end-to-end on `main` / production for the stated capability |
| **PARTIAL** | Shipped scaffolding or v1; gaps remain for a full product claim |
| **PLANNED** | Desired; not meaningfully productized yet |

### 5.1 Auth, tenancy & roles

| Feature | Status | Notes |
|---------|--------|-------|
| HMAC-signed sessions (`SESSION_SECRET`) | **DONE** | Replaces forgeable base64 cookie |
| Per-license membership (`user_licenses`) | **DONE** | Users only see companies they belong to |
| RLS policies on core tables | **DONE** | Applied via migrations; app still uses service role server-side with membership filters |
| Retell webhook shared secret | **DONE** | `RETELL_WEBHOOK_SECRET` required in production |
| Roles: RMO, ADMIN, PM, FOREMAN, OPERATOR | **DONE** | Matrix in `frontend/src/lib/roles.ts`; UI at `/dashboard/roles` |
| Team invite / roster management | **DONE** | Invites + temp password on create; `company_invites` |
| Company onboarding wizard | **DONE** | `/dashboard/onboarding` — ownership, duty statement, bonds/BQI docs |
| Full Supabase Auth (magic link / OAuth) | **PLANNED** | Pilot password + hashed passwords today |
| Admin action / retention audit log | **PLANNED** | — |

See [AUTH.md](./AUTH.md), [ROLES.md](./ROLES.md).

### 5.2 Operator intake (day-to-day)

| Feature | Status | Notes |
|---------|--------|-------|
| Voice check-in → Claude extract → flags → DB | **DONE** | Core spine |
| Mobile operator home + dial CTA | **DONE** | `/operator` |
| Structured PWA submit report | **DONE** | Multi-project fields, per-sub COI uploads, membership-scoped history |
| Operator report history / edits | **DONE** | `/operator/history` |
| Photo / permit / COI file upload | **DONE** | Storage + URLs on logs |
| Video attachments | **PLANNED** | Not in scope yet |
| Operator-initiated “escalate now” workflow | **PARTIAL** | Flags exist; no separate escalate action UX |
| Service worker / offline PWA | **PLANNED** | Manifest only on `main` |

### 5.3 Compliance rules, inbox & alerts

| Feature | Status | Notes |
|---------|--------|-------|
| Rule engine (WC, $ threshold, unverified sub, expired COI, B-scope mismatch, missing permit) | **DONE** | v1 flags |
| Configurable thresholds / flag toggles per license | **DONE** | `/dashboard/settings` + `compliance_settings` |
| Needs-review inbox | **DONE** | `/dashboard/inbox` — All / Critical / Flagged |
| Dashboard “Needs review” tile | **DONE** | Links into inbox |
| Critical flag → email/SMS (`notifyRMO`) | **DONE** | Resend + Twilio when env set; else console |
| Morning digest + low-involvement alerts | **DONE** | `POST /api/jobs/digests` (+ cron secret); `digest_runs` audit |
| Recipient allowlist / blocklist | **DONE** | Hard block for Eric; env allowlist for pilot |
| Push notifications | **PLANNED** | — |

See [ALERTS.md](./ALERTS.md), [RULES.md](./RULES.md).

### 5.4 Supervision evidence

| Feature | Status | Notes |
|---------|--------|-------|
| Typed supervision activities table + API | **DONE** | Migration `003`; `/dashboard/supervision` |
| Activity types (ops, tech/admin, workmanship, on-site, delegated) | **DONE** | v1 activity model |
| Site visit / decision logging linked to company/project | **DONE** | MVP |
| Involvement heatmap | **PARTIAL** | Counts / recent activity; rich heatmap UI still light |
| QC checklists | **PLANNED** | — |
| Delegation registry (formal) | **PARTIAL** | Covered partly by activity types; not a full registry |
| Visit schedule optimizer | **PLANNED** | — |

### 5.5 Firm portfolio & CSLB clocks

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-company license switcher | **DONE** | Membership-scoped |
| Firm portfolio home | **DONE** | `/dashboard/portfolio` |
| §7068.1 three-firm / 365-day tracker | **DONE** | Association events + meter |
| Eligibility categories (ownership 20%, subsidiary/JV, same officers, etc.) | **DONE** | On association model |
| Disassociation §7068.2 90-day clocks | **DONE** | `firm_disassociation_clocks` |
| Ownership % / BQI exemption ledger (deep) | **PARTIAL** | Fields on licenses + onboarding; not a full ledger product |
| Personnel-of-record snapshot (RME/RMM/RMG history) | **PARTIAL** | License fields; no full classification history UI |
| Qualifier duty statement (versioned) | **PARTIAL** | Stored on license / used in export; versioning light |

See [PORTFOLIO.md](./PORTFOLIO.md).

### 5.6 Projects, vault & hygiene

| Feature | Status | Notes |
|---------|--------|-------|
| Project registry UI (list/detail) | **DONE** | `/dashboard/projects` |
| Projects upserted from intake | **DONE** | Backend path |
| Subcontractor compliance flags | **DONE** | At ingestion; board is still light |
| Document vault + expiry surfaces | **DONE** | `/dashboard/vault` |
| Workers’ comp status + rule | **DONE** | On license + rules |
| Contractor bond / BQI tracking fields | **PARTIAL** | Onboarding / license columns; reminder depth limited |
| License renewal reminders | **PARTIAL** | Expiry shown; digest can cover; dedicated renewal product thin |
| Cross-company kanban status board | **PLANNED** | License switcher only |
| Calendar (visits / renewals / inspections) | **PLANNED** | — |
| Contracts / change orders entities | **PLANNED** | — |

### 5.7 Audit & defense

| Feature | Status | Notes |
|---------|--------|-------|
| Per-log RMO review + notes | **DONE** | Mark reviewed |
| Monthly audit report + canvas signature | **DONE** | `/dashboard/audit-report` |
| Multi-page audit defense PDF | **DONE** | `/dashboard/export` |
| ZIP evidence package (JSON, transcripts, manifest) | **DONE** | Same export flow |
| Immutable hash-chained timeline | **PLANNED** | Append-oriented logs today |
| SOP / policy library | **PLANNED** | — |
| DocuSign-class e-sign | **PLANNED** | Canvas signature only |

See [EXPORT.md](./EXPORT.md).

### 5.8 Collaboration & differentiation

| Feature | Status | Notes |
|---------|--------|-------|
| Messaging / tasks RMO ↔ operators | **PLANNED** | — |
| User-editable report templates | **PLANNED** | Extraction prompt hardcoded |
| AI weekly briefing (synthesis) | **PLANNED** | Per-call extract only today |
| Composite risk score / trends | **PARTIAL** | Discrete flags + severities |
| Operator training modules | **PLANNED** | — |

---

## 6. Database migrations (applied)

| # | File | Purpose |
|---|------|---------|
| 001 | `001_auth_company_isolation.sql` | Users auth fields, `user_licenses`, RLS helpers/policies, pilot membership backfill |
| 002 | `002_compliance_documents_bucket.sql` | Storage bucket `compliance-documents` + read policy |
| 003 | `003_supervision_activities.sql` | Supervision evidence log + RLS |
| 004 | `004_firm_portfolio_clocks.sql` | Ownership/bond/duty columns, associations, 90-day clocks |
| 005 | `005_compliance_settings_digests.sql` | Rule settings + `digest_runs` |
| 006 | `006_roles_onboarding.sql` | Onboarding fields + `company_invites` |

---

## 7. Dashboard & operator map

### RMO dashboard (`/dashboard/…`)

| Route | Feature |
|-------|---------|
| `/` (dashboard home) | Overview, needs-review tile, license switcher |
| `/dashboard/inbox` | Unreviewed / critical / flagged queue |
| `/dashboard/[logId]` | Single compliance log review |
| `/dashboard/compliance-log` | Log list |
| `/dashboard/supervision` | Supervision activities |
| `/dashboard/projects` | Project registry |
| `/dashboard/portfolio` | Firm associations & CSLB clocks |
| `/dashboard/vault` | Documents / expiries |
| `/dashboard/audit-report` | Monthly sign & submit |
| `/dashboard/export` | Defense PDF + ZIP |
| `/dashboard/settings` | Rules & digests |
| `/dashboard/roles` | Team matrix & invites |
| `/dashboard/onboarding` | Company setup wizard |

### Operator PWA

| Route | Feature |
|-------|---------|
| `/operator` | Home + dial CTA |
| `/operator/submit-report` | Structured multi-project report + uploads |
| `/operator/history` | Past submissions / edits |

---

## 8. Environment (production highlights)

**Backend:** `SUPABASE_URL`, `SUPABASE_KEY` (service_role), `ANTHROPIC_API_KEY`, `RETELL_WEBHOOK_SECRET`, `ALERT_EMAIL_ALLOWLIST`, `DASHBOARD_URL`, optional Resend/Twilio/cron secrets.

**Frontend:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_KEY`, `SESSION_SECRET`, `BACKEND_URL` / `NEXT_PUBLIC_BACKEND_URL`, `RETELL_WEBHOOK_SECRET`, `ALERT_EMAIL_ALLOWLIST`, `PILOT_PASSWORD`.

Details: [AUTH.md](./AUTH.md), [ALERTS.md](./ALERTS.md), root / `frontend/.env.example`.

---

## 9. Build priority history (top 10)

Original gap-analysis order — **all ten have shipped to `main`** in some form:

| # | Build | Outcome |
|---|-------|---------|
| 1 | Real auth + company isolation | **DONE** |
| 2 | Structured PWA intake + uploads | **DONE** |
| 3 | Needs-review inbox + notify plumbing | **DONE** |
| 4 | Document vault + expiries | **DONE** (v1) |
| 5 | Project registry UI | **DONE** (v1) |
| 6 | Supervision evidence log MVP | **DONE** |
| 7 | Firm portfolio + 3-firm / 90-day clocks | **DONE** |
| 8 | Audit defense PDF + ZIP | **DONE** |
| 9 | Configurable rules + digests | **DONE** |
| 10 | Roles matrix + onboarding wizard | **DONE** |

Historical gap snapshot (pre-build): [FEATURE_GAP_ANALYSIS.md](./FEATURE_GAP_ANALYSIS.md) — **superseded by this file** for current status.

---

## 10. What’s next (suggested)

Ordered for B2B readiness after the pilot spine:

1. **Replace pilot password with Supabase Auth** (invite accept, password reset, no shared `PILOT_PASSWORD`).  
2. **Turn on Resend/Twilio fully** for Jonathan only; later remove Eric hard-block when Vanguard goes live.  
3. **Cron the morning digest** (Vercel cron or external) with `CRON_SECRET`.  
4. **Harden operator/PWA offline** (service worker) and richer attachment UX.  
5. **Calendar + renewal/bond countdowns** as first-class UI (beyond vault/digest).  
6. **Composite risk / involvement trends** per firm for sales demos.  
7. **Billing / multi-tenant signup** when selling outside Beachum + Vanguard.  
8. **SOP library + messaging** once core compliance loop is sticky for a second RMO customer.

---

## 11. Marketing assets (related)

- 30s / 60s B2B video voiceover scripts drafted in chat (problem → proof → offer; CSLB oversight angle).  
- Live demo URL for creatives: https://rmo.buildmyoffice.com  

---

## 12. Related docs

| Doc | Topic |
|-----|-------|
| [AUTH.md](./AUTH.md) | Sessions, membership, env, pilot emails |
| [ALERTS.md](./ALERTS.md) | Inbox, critical alerts, allowlist/blocklist |
| [RULES.md](./RULES.md) | Configurable rules & digests |
| [PORTFOLIO.md](./PORTFOLIO.md) | Firm limits & 90-day clocks |
| [ROLES.md](./ROLES.md) | Role matrix & onboarding |
| [EXPORT.md](./EXPORT.md) | Audit defense package |
| [FEATURE_GAP_ANALYSIS.md](./FEATURE_GAP_ANALYSIS.md) | Original pre-build gap table (historical) |

---

## 13. One-line summary

**Pilot-ready RMO ops product on production:** multi-company auth, operator voice/PWA intake, rules + inbox + digests, supervision + portfolio clocks, vault/projects, and audit defense export — with Eric email hard-blocked until testing is finished.
