# RMO Compliance — Feature Gap Analysis

**Date:** 2026-09-12  
**Baseline branch analyzed:** `main` @ `bf54c58`  
**Related WIP (not merged):** `origin/cursor/pwa-form-and-operator-edits` @ `88c7b3c`  
**Product goal:** Help California RMOs organize and automate day-to-day operator information for CSLB-compliant oversight.

Status key:

| Status | Meaning |
|--------|---------|
| **DONE** | Usable end-to-end on `main` for the stated capability |
| **PARTIAL** | Scaffolding, data fields, or adjacent flows exist; not product-complete |
| **MISSING** | No meaningful models, routes, UI, or backend paths |

---

## 1. Stack overview

| Layer | Choices |
|-------|---------|
| **Layout** | Two-package repo (not a formal monorepo workspace): root Express backend + `frontend/` Next.js app |
| **Backend** | Node.js ≥18, Express 5 (`src/server.js`), Vercel Node (`vercel.json`) |
| **Frontend** | Next.js 14 App Router, React 18, TypeScript, Tailwind CSS 3 |
| **AI / voice** | Retell AI webhook (`call_ended`) → Anthropic Claude extraction (`claude-sonnet-4-6` default) |
| **Rules** | In-process compliance rule engine in `src/server.js` (`evaluateComplianceRules`) |
| **Database** | Supabase (Postgres). Tables referenced in code: `licenses`, `users`, `compliance_logs`, `projects`, `subcontractors`, `monthly_audit_reports` |
| **Storage** | Not used on `main`. WIP branch uploads to Supabase Storage (`compliance-uploads`) |
| **Auth** | Pilot cookie auth — single allowlisted email + shared password; base64url session cookie `rmo_session`; roles are UI modes `RMO` \| `OPERATOR` (not separate accounts). **Not** Supabase Auth |
| **PDF / e-sign (pilot)** | Client-side `jspdf` + `html2canvas`; `react-signature-canvas` for monthly audit signature |
| **PWA** | `frontend/public/manifest.json` + mobile-oriented operator pages; no service worker on `main` |
| **Pilot clients in DB** | Beachum Construction (#836089), Vanguard Property Maintenance (#1160775) |

**Primary data flow (operational today):**

1. Operator dials Retell line *or* submits a manual form that synthesizes a fake Retell payload  
2. Backend extracts structured JSON via Claude  
3. Rule engine writes `risk_flags`  
4. Row inserted into `compliance_logs`; projects/subs upserted  
5. RMO reviews in Next.js dashboard; monthly audit can be signed + PDF-downloaded  

---

## 2. Feature gap table

### 1. Company & qualifier portfolio

| Desired capability | Status | Evidence |
|--------------------|--------|----------|
| Multi-company workspace for one RMO | **PARTIAL** | `licenses` table + `LicenseSwitcher` (`frontend/src/components/LicenseSwitcher.tsx`); dashboard/`?license=` switching. No RMO↔company membership model, firm portfolio home, or firm-limit awareness. Same pilot user sees all licenses. |
| Firm limit tracker (3 firms / one-year rolling) | **MISSING** | No association events, rolling window, or 3-firm counter. |
| Eligibility for additional firms (20% ownership, subsidiary/JV, same officers) | **MISSING** | No ownership / corporate-structure models. |
| Ownership % ledger (BQI 10% exemption) | **MISSING** | No ownership ledger or BQI exemption logic. |
| Personnel-of-record snapshot (RMO/RME/RMM/RMG, classifications, license #s) | **PARTIAL** | `licenses` has `rmo_name`, `classification`, `license_number`, `entity_name` (`frontend/src/lib/types.ts`). No RME/RMM/RMG roles, classification history, or personnel snapshot UI. |
| Qualifier duty statement builder (versioned, exportable) | **MISSING** | No duty-statement models or export. |
| Association lifecycle + disassociation 90-day clocks | **MISSING** | No association/disassociation entities or countdowns. |

### 2. Day-to-day operator intake

| Desired capability | Status | Evidence |
|--------------------|--------|----------|
| Operator-of-the-day daily reports (mobile-friendly) | **DONE** | Voice: Retell webhook `POST /api/webhooks/retell` (`src/server.js`). Manual: `/operator/submit-report` (`SubmitReportClient.tsx`) + `/operator` home with `tel:` CTA. Manifest + viewport tuned for mobile. |
| Structured fields mapped to RMO duties | **PARTIAL** | Extraction schema covers projects, subs, crew, permits (`extractDataFromTranscript`). Manual form fields are free-text → synthetic transcript, not a duty-mapped checklist. WIP branch has richer structured multi-project form. |
| Photo/video attachments | **MISSING** on `main` | Manual form has no file inputs. **WIP:** photos/permits/COI uploads to Supabase Storage via `POST /api/submit-report` on feature branch. Video not mentioned. |
| Escalation flags | **PARTIAL** | Rule engine produces `critical_flags` / `warning_flags` / `raw_flags`; UI badges (`RiskFlagBadge.tsx`). No operator-initiated escalate action, severity workflow, or alert routing beyond `console.log` in `notifyRMO`. |
| Weekly/monthly rollups | **PARTIAL** | Monthly audit report (`/dashboard/audit-report`, `GET/POST /api/audit` → `monthly_audit_reports`). No weekly rollup; audit month is calendar-current only. |
| Roles: RMO, company admin, PM/superintendent, foreman/operator | **PARTIAL** | Only `RMO` and `OPERATOR` modes (`frontend/src/lib/auth.ts`). Backend `users.role` lookup for `OPERATOR` exists; no admin/PM/foreman roles or permission matrix. |

### 3. Supervision evidence log

| Desired capability | Status | Evidence |
|--------------------|--------|----------|
| Activity types (supervise ops, tech/admin decisions, workmanship, on-site, monitor delegated work) | **MISSING** | Logs are intake/compliance extracts (`VOICE_CALL` / synthetic), not typed supervision activities. |
| Site visit planner/log | **MISSING** | No visits table or planner UI. |
| Decision log | **MISSING** | RMO notes on a log (`ReviewActions` → PATCH `rmo_notes`) only; not a general decision log. |
| QC/workmanship checklists | **MISSING** | No checklist models or UI. |
| Delegation registry | **MISSING** | No delegation entities. |
| Involvement heatmap per company/project | **MISSING** | Dashboard shows counts/recent logs only (`dashboard/page.tsx`). |

### 4. Project & ops command center

| Desired capability | Status | Evidence |
|--------------------|--------|----------|
| Project registry linked to license classifications | **PARTIAL** | `projects` upsert from extraction (`upsertProject`); dashboard shows **active project count** only. No project list/detail UI; classification linkage is license-level, not project↔classification mapping. Scope-mismatch rule uses license classification + reported trades. |
| Permits, inspections, COIs, contracts, change orders | **PARTIAL** | Permits & COI **fields** in extraction + subcontractor `coi_expiration_date`; rules for `MISSING_PERMIT`, `EXPIRED_COI`. No inspections, contracts, or change-order entities/UI. WIP adds per-sub COI docs + permit files. |
| Subcontractor compliance flags | **PARTIAL** | `subcontractors` table + `UNVERIFIED_SUBCONTRACTOR` / `EXPIRED_COI` flags. No dedicated sub compliance board; `cslb_verified` always written `false` on upsert. |
| Cross-company job status board | **MISSING** | License switcher only; no multi-company kanban/status board. |
| Calendar for visits/renewals/inspections | **MISSING** | `license_expire_date` displayed on dashboard header; no calendar, reminders, or visit scheduling. |

### 5. Bonds, insurance & license hygiene

| Desired capability | Status | Evidence |
|--------------------|--------|----------|
| Contractor bond, BQI $25k, WC tracking | **PARTIAL** | `workers_comp_status` on `licenses` + `WORKERS_COMP_VIOLATION` rule when exempt + direct employees. No bond or BQI tracking. |
| Ownership-change → BQI required | **MISSING** | No ownership-change events. |
| License renewal/status reminders | **PARTIAL** | `license_expire_date` shown; no reminder jobs, digests, or countdown alerts. |
| Document vault with expiries | **MISSING** on `main` | No vault. WIP stores COI/permit/photo URLs in storage + `extracted_data.file_urls`; still not a vault with expiry management UI. |

### 6. Compliance alerts & digests

| Desired capability | Status | Evidence |
|--------------------|--------|----------|
| Low-involvement alerts | **MISSING** | No involvement metrics or thresholds. |
| Unreviewed operator reports | **PARTIAL** | `rmo_reviewed` on logs + review UI; dashboard does not surface an “unreviewed” inbox/filter. |
| Disassociation/bond/insurance countdowns | **MISSING** | No countdown entities; COI expiry only flagged at ingestion time. |
| Multi-firm overload warnings | **MISSING** | No firm-count logic. |
| Morning digest / needs-decision inbox | **MISSING** | `notifyRMO` is a TODO (`console.log` only). No email/SMS/push or digest scheduler. |

### 7. Audit & defense package

| Desired capability | Status | Evidence |
|--------------------|--------|----------|
| Evidence export PDF/ZIP | **PARTIAL** | Monthly audit PDF download (`AuditReportClient.tsx` — single-page clip). No ZIP package; no full evidence bundle (recordings, attachments, timeline). `call_recording_url` stored but not rendered/exported. |
| Immutable activity timeline | **PARTIAL** | Append-oriented `compliance_logs` with timestamps; no immutability guarantees, hash chaining, or edit audit trail. WIP adds log PATCH for operator corrections (mutability increases). |
| RMO acknowledgement flows | **PARTIAL** | Per-log mark reviewed + notes; monthly sign & submit to `monthly_audit_reports` with signature data URL. No per-flag ack, legal attestation templates, or reload of prior signed reports in UI. |
| SOP/policy library | **MISSING** | No SOP/policy content or storage. |

### 8. Collaboration & automation

| Desired capability | Status | Evidence |
|--------------------|--------|----------|
| Messaging/tasks between RMO and operators | **MISSING** | No messages or tasks. |
| Templates | **MISSING** | Extraction prompt is hardcoded; no user-facing templates. |
| Rules engine | **DONE** (v1) | Six flags in `evaluateComplianceRules`: WC violation, $10k threshold, unverified sub, expired COI, B-General scope mismatch, missing permit. Not configurable; no UI. |
| E-sign | **PARTIAL** | Canvas signature on monthly audit only; stored as PNG data URL in DB — not a DocuSign-class e-sign workflow. |
| Push/email/SMS notifications | **MISSING** | Explicit TODO in `notifyRMO`; no providers wired. |

### 9. Admin, security, multi-tenancy

| Desired capability | Status | Evidence |
|--------------------|--------|----------|
| Company isolation | **PARTIAL** | Data keyed by `license_id`; UI filters by selected license. **No RLS enforcement in app** — frontend uses service-role client (`getSupabaseAdmin`). Any authenticated session can query any license number. |
| Permission matrix | **MISSING** | Binary mode check only (`RMO` vs `OPERATOR`). OPERATOR can still hit several GET APIs. |
| Onboarding wizard | **MISSING** | Hardcoded pilot login; no company/license onboarding. |
| Retention / admin audit log | **MISSING** | No retention policy or admin action log. |

### 10. Differentiating nice-to-haves

| Desired capability | Status | Evidence |
|--------------------|--------|----------|
| AI weekly briefing | **PARTIAL** | Claude used for **per-call extraction**, not weekly synthesis/briefings. |
| Visit schedule optimizer | **MISSING** | — |
| Risk scoring | **PARTIAL** | Discrete flags + severities; no composite score, trend, or company risk index. |
| Operator training modules | **MISSING** | — |

### Coverage summary (`main`)

| Area | DONE | PARTIAL | MISSING |
|------|------|---------|---------|
| 1. Portfolio | 0 | 2 | 5 |
| 2. Operator intake | 1 | 4 | 0* |
| 3. Supervision evidence | 0 | 0 | 6 |
| 4. Project command center | 0 | 3 | 2 |
| 5. Bonds/insurance/hygiene | 0 | 2 | 2 |
| 6. Alerts & digests | 0 | 1 | 4 |
| 7. Audit & defense | 0 | 3 | 1 |
| 8. Collaboration | 1 | 1 | 3 |
| 9. Admin/security | 0 | 1 | 3 |
| 10. Nice-to-haves | 0 | 2 | 2 |
| **Totals (approx.)** | **2** | **19** | **28** |

\*Photo/video counted MISSING under intake detail row; role matrix PARTIAL.

**What is operational today (pilot-ready spine):** voice + manual operator check-ins → Claude extract → compliance flags → Supabase audit trail → multi-license RMO dashboard → per-log review → monthly signed audit PDF.

---

## 3. Top 10 recommended next builds

Prioritized for refining an **already-operational** pilot into a durable RMO product. Order favors compliance risk reduction, data quality, and security before greenfield modules.

| # | Build | Why first |
|---|-------|-----------|
| **1** | **Real auth + company isolation** — replace forgeable base64 cookie + service-role dashboard access with signed sessions (or Supabase Auth), per-license membership, and RLS | Pilot auth is a blocker for any second user or production claim of isolation |
| **2** | **Merge & harden structured PWA intake** — land WIP form path (`/api/submit-report`, persistent projects, per-sub COI uploads) with validation, auth on backend routes, and operator↔license binding | Highest-leverage improvement to day-to-day evidence quality vs free-text→fake-transcript |
| **3** | **Needs-review inbox + notification plumbing** — unreviewed/critical queue on dashboard; implement `notifyRMO` via email (then SMS) | Closes the loop on flags the engine already produces |
| **4** | **Document vault + expiry countdowns** — COIs, WC, license renewals, contractor bond; calendar/digest of upcoming expiries | Natural extension of existing WC/COI/license fields; high CSLB hygiene value |
| **5** | **Project registry UI** — list/detail per license, status, permits, linked logs/subs; cross-company status board v1 | `projects` already written; UI is the gap |
| **6** | **Supervision evidence log (MVP)** — activity types, site visits, RMO decision notes linked to company/project; simple involvement heatmap | Core differentiator vs “call logger”; currently entirely missing |
| **7** | **Firm portfolio + 3-firm / 90-day clocks** — associations, disassociation countdown, personnel-of-record snapshot | CSLB-specific portfolio risk the product claims to address |
| **8** | **Audit defense package v2** — multi-page PDF + ZIP (logs, transcripts, recordings, attachments, signature metadata); load prior signed months | Strengthens existing monthly audit into courtroom/CSLB-ready evidence |
| **9** | **Configurable rules + low-involvement alerts** — admin-editable thresholds; “no check-in in N days” alerts; morning digest | Extends DONE rules engine into ongoing oversight |
| **10** | **Roles matrix + onboarding wizard** — company admin / PM / foreman; invite flow; license attach | Unlocks multi-user ops without building full collaboration suite yet |

Defer for later (after #1–10): messaging/tasks, SOP library, e-sign provider, visit optimizer, AI weekly briefing, training modules, ownership/BQI ledger depth.

---

## 4. Notable bugs, tech debt & architectural risks

### Security (critical for anything beyond single-pilot)

1. **Unsigned session cookie** — `createSessionToken` is base64url JSON (`frontend/src/lib/auth.ts`). Anyone who can set `rmo_session` to the known email/mode is authenticated.  
2. **Service-role key in Next.js server paths** — `getSupabaseAdmin()` bypasses RLS for all dashboard/API reads/writes (`frontend/src/lib/supabase.ts`). Combined with (1), full DB access.  
3. **Default pilot password** in code + shown on login UI (`getPilotPassword()` → `rmo-pilot`).  
4. **Retell webhook has no signature verification** despite `RETELL_API_KEY` env mention — unauthenticated writers can inject compliance logs.  
5. **OPERATOR mode can read** GET `/api/logs`, `/api/licenses`, `/api/audit` for any license number.

### Product / correctness

6. **Dashboard “Compliance logs” count** uses `logs.length` capped at 20 — undercounts totals (`dashboard/page.tsx`).  
7. **Operator history always uses `DEFAULT_LICENSE` `836089`** — not session- or operator-scoped (`operator/history/page.tsx`).  
8. **Manual report path** posts a fabricated Retell payload to the public webhook (extra Claude cost; brittle); hardcoded Vercel fallback URL if env unset.  
9. **`cslb_verified` forced to `false`** on every subcontractor upsert — unverified-sub flags will fire repeatedly without a verification workflow.  
10. **Projects upsert lacks DB uniqueness** — comment notes no `UNIQUE(license_id, project_address)`; race/dupe risk (`upsertProject`).  
11. **PDF export clips to one page** (`Math.min(height, pageHeight)` in `AuditReportClient.tsx`).  
12. **Signatures stored as data URLs** in `rmo_signature_url` — DB bloat; not a durable object URL.  
13. **Monthly audit does not reload prior signed report**; Navbar “Monthly Audit” drops `?license=` so switcher selection can be lost.  
14. **`notifyRMO` is stub-only** — critical flags never leave the server logs.

### Architecture / maintainability

15. **Dual data paths** — RSC pages query Supabase directly; parallel Next API routes (`/api/logs`, `/api/licenses`) are largely unused by UI.  
16. **Single 600-line backend file** with extraction prompt, rules, and storage mixed — hard to test; no automated tests in repo.  
17. **No schema migrations in repo** — table shapes inferred from app code only; drift risk (e.g. `rmo_reviewed_at` / `updated_at` written but absent from `ComplianceLog` type).  
18. **License numbers hardcoded in Claude prompt** (Beachum/Vanguard inference) — pilot-coupled; will mis-attribute as clients grow.  
19. **PWA incomplete** — manifest icons point at `/favicon.ico` under `public/` while favicon lives under `src/app/`; no service worker/offline.  
20. **Unmerged WIP branch** (`cursor/pwa-form-and-operator-edits`) substantially expands intake/storage/edit paths — reconcile before parallel feature work to avoid duplicate designs.

---

## 5. Method notes

- Inventory based on repository source on `main` (backend `src/server.js`, all `frontend/src/**`).  
- No live Supabase schema dump or production traffic review was performed; table/column lists are **code-referenced**, not migration-proven.  
- WIP branch was inspected for upcoming intake/COI/storage work and called out explicitly so it is not double-counted as shipped.

---

## Appendix A — Route map (`main`)

| Surface | Path |
|---------|------|
| Login | `/` |
| RMO dashboard | `/dashboard` |
| Compliance log | `/dashboard/compliance-log` |
| Log detail + review | `/dashboard/[logId]` |
| Monthly audit | `/dashboard/audit-report` |
| Operator home | `/operator` |
| Manual report | `/operator/submit-report` |
| Operator history | `/operator/history` |
| Backend webhook | `POST /api/webhooks/retell` |
| Backend health | `GET /api/health` |
| Next APIs | `/api/auth/*`, `/api/logs`, `/api/logs/[id]`, `/api/licenses`, `/api/audit` |

## Appendix B — Rule engine flags (`main`)

| Flag | Severity band | Trigger |
|------|---------------|---------|
| `WORKERS_COMP_VIOLATION` | Critical | Direct employees + license WC `EXEMPT` |
| `THRESHOLD_EXCEEDED` | High | Project contract value > $10,000 |
| `UNVERIFIED_SUBCONTRACTOR` | Medium | Sub without `cslb_verified` |
| `EXPIRED_COI` | High | Sub COI date &lt; today |
| `SCOPE_MISMATCH` | Medium | B-General without framing and &lt; 3 trades |
| `MISSING_PERMIT` | Medium | &gt;$10k project without reported permit |
