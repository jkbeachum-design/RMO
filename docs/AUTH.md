# Authentication & company isolation

## Current model (Supabase Auth + signed app session)

| Layer | What it does |
|-------|----------------|
| **Supabase Auth** | Email/password credentials (`auth.users`). Login verifies here first. |
| **`public.users` + `user_licenses`** | App identity + company membership / roles. Linked via `users.auth_user_id`. |
| **Signed `rmo_session` cookie** | HMAC-SHA256 session (`SESSION_SECRET`) with `userId`, mode (RMO vs Operator), and license ids. Dashboard and Operator PWA keep using this cookie — not a browser Supabase JWT. |

### Product locks

- **RMO / ADMIN** → RMO dashboard (portfolio, companies, invites, settings).
- **OPERATOR / PM / FOREMAN** → Operator report portal (`/operator`) only unless they also hold RMO-class memberships.
- Mode switch appears only when the user has both RMO-class and operator-class memberships. See [ROLES.md](./ROLES.md).

## Login flow

1. `POST /api/auth/login` with email + password (+ optional mode).
2. Server calls Supabase Auth `signInWithPassword` (anon key, ephemeral client — session is not persisted in the browser).
3. Resolve `public.users` by `auth_user_id`, else by email; link `auth_user_id` if missing.
4. Load `user_licenses`, pick RMO vs Operator mode, set signed `rmo_session`.
5. Redirect: Operator mode → `/operator`; RMO mode → `/dashboard`.

### One-time legacy hash migration

If Auth sign-in fails but `users.password_hash` (scrypt) still verifies the password, the server **creates/links** a Supabase Auth user with that password and continues. After that, Auth is authoritative. **`PILOT_PASSWORD` is no longer read for login** (deprecated).

## Forgot / reset password

Use this when the password is unknown (do **not** bring back `PILOT_PASSWORD`).

1. Login → **Forgot password?** → `/forgot-password`.
2. `POST /api/auth/forgot-password` with `{ email }`.
3. Server may provision a Supabase Auth user for an existing `public.users` row that lacks `auth_user_id`, then calls Auth `resetPasswordForEmail` with  
   `redirectTo = {origin}/auth/reset-password`  
   (`origin` = `NEXT_PUBLIC_SITE_URL` or request Origin / production default).
4. Supabase sends the built-in reset email (no custom mailer in this app).
5. User opens the link → `/auth/reset-password` (or `/auth/confirm` → forward) establishes a recovery session (`?code=` PKCE, `token_hash`, or implicit hash).
6. User sets a new password via `updateUser({ password })`, then signs in on `/` → same `rmo_session` + membership routing as normal login.

Always returns a generic success message (no email enumeration).

## Invites (operators / team)

`POST /api/roles` with `action: invite` or `add`:

1. Creates a Supabase Auth user (Admin API, email confirmed) with a one-time temporary password.
2. Inserts/links `public.users.auth_user_id` and `user_licenses`.
3. Returns `temporary_password` once in the API response (Roles UI shows it). Share out-of-band; Eric invite can use this path later without lifting alert blocks.

Existing app users without `auth_user_id` get Auth provisioned on invite/add.

## Env vars

### Backend (root `.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | yes | Postgres API |
| `SUPABASE_KEY` | yes | **service_role** — webhook inserts + Auth Admin; never ship to browser |
| `ANTHROPIC_API_KEY` | yes | Claude extraction |
| `RETELL_WEBHOOK_SECRET` | **yes in production** | Shared secret for Retell + Next.js proxy |
| `RETELL_API_KEY` | fallback | Accepted as webhook secret if `RETELL_WEBHOOK_SECRET` unset |
| `ANTHROPIC_MODEL` | no | default `claude-sonnet-4-6` |
| `PORT` | no | default `3001` |

### Frontend (`frontend/.env.local` / Vercel)

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (`https://hiceshmpjvqfptytlyzo.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon/publishable key (Auth password verify + reset client) |
| `SUPABASE_KEY` | yes | Server-only service role (membership queries + Auth Admin invites) |
| `SESSION_SECRET` | **yes in production** (≥16 chars) | HMAC key for signed cookies |
| `NEXT_PUBLIC_SITE_URL` | recommended | Canonical origin for reset emails (`https://rmo.buildmyoffice.com` in prod; `http://localhost:3000` locally). Falls back to request Origin / defaults. |
| `BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL` | yes for manual submit | Express backend base URL |
| `RETELL_WEBHOOK_SECRET` | yes for manual submit | Forwarded by `/api/operator/submit-report` |
| `PILOT_PASSWORD` | **deprecated** | Ignored for login. Unset after Auth cutover. Use Forgot password instead. |

Generate a strong session secret:

```bash
openssl rand -base64 32
```

## Supabase Dashboard (required after merge)

Project: `hiceshmpjvqfptytlyzo`

1. **Authentication → URL Configuration**
   - **Site URL:** `https://rmo.buildmyoffice.com`
   - **Redirect URLs allow list** (required for reset emails):
     - `https://rmo.buildmyoffice.com/**`
     - `https://rmo.buildmyoffice.com/auth/reset-password`
     - `https://rmo.buildmyoffice.com/auth/confirm`
     - `http://localhost:3000/**` (local)
     - `http://localhost:3000/auth/reset-password`
     - `http://localhost:3000/auth/confirm`
2. **Authentication → Providers → Email:** enabled (password). Confirmations can stay on; invites use Admin `email_confirm: true`.
3. **Authentication → Email Templates → Reset password**  
   Default Supabase template is fine. No custom app mailer.  
   Optional: if you switch the template to PKCE `token_hash` links, point them at  
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password`.  
   Built-in SMTP is enough for pilot volume; configure custom SMTP only if you hit rate limits or need branded From addresses.
4. **Jonathan first-time Auth** (pick one):
   - **A. Auto-migrate:** Sign in once with the password that still matches his legacy `password_hash` (former pilot password). Server creates Auth + sets `auth_user_id`.
   - **B. Forgot password:** Use `/forgot-password` — provisions Auth if needed and emails a reset link.
   - **C. Dashboard:** Authentication → Users → Add user → `jbeachum@buildmyoffice.com` + password → then run link SQL or the bootstrap script.
   - **D. Script** (service role):

```bash
SUPABASE_URL=https://hiceshmpjvqfptytlyzo.supabase.co \
SUPABASE_KEY=<service_role> \
BOOTSTRAP_EMAIL=jbeachum@buildmyoffice.com \
BOOTSTRAP_PASSWORD='<strong-password>' \
node scripts/bootstrap-supabase-auth.mjs
```

5. **Vercel:** Confirm `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_KEY`, `SESSION_SECRET`, and set `NEXT_PUBLIC_SITE_URL=https://rmo.buildmyoffice.com`. **Unset `PILOT_PASSWORD`.**

## Database

Apply migrations through `001` … `007` as before. `008_supabase_auth_cutover.sql` is a no-op marker documenting the Auth cutover (no new public tables / GRANTs).

`users.auth_user_id` and RLS helpers (`current_app_user_id`) were introduced in `001_auth_company_isolation.sql`.

## Retell configuration

In the Retell dashboard (or your proxy), send one of:

- `Authorization: Bearer <RETELL_WEBHOOK_SECRET>`
- `x-retell-signature: <RETELL_WEBHOOK_SECRET>`

Manual operator submits go through `POST /api/operator/submit-report` (session + membership required), which attaches the secret server-side. The browser never calls the webhook anonymously.

## Manual verification

1. **Forged cookie:** Set `rmo_session` to base64 JSON of `{email,mode}` → fail (401 / redirect to login).
2. **Auth login:** Valid Supabase Auth user linked to `users` + memberships → dashboard lists only their licenses.
3. **Operator-only:** Operator-class memberships → land on `/operator`; no RMO create UI.
4. **Cross-company:** Request another license → 403 / denied.
5. **Invite:** Roles → **Add CEO** (or invite OPERATOR) → temporary password shown once → that user signs in without `PILOT_PASSWORD` and lands on `/operator`.
6. **New RMO:** `/onboarding` → confirm RMO → create email/password + first company → role assigned at signup; login stays email/password only (no role toggle).
6. **Forgot password:** Request reset → open email link → set password → sign in → `rmo_session` works.
7. **Webhook:** `POST /api/webhooks/retell` without secret → `401` in production.

## Automated tests

```bash
npm test
```

Covers signed vs forged cookies, password hash verify (legacy cutover), Auth session helpers (mode/role), password-reset URL helpers + password policy, membership helper, webhook secret acceptance.
