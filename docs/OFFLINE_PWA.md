# Operator offline PWA — dogfood notes

Operator-facing pages (`/operator`, `/operator/submit-report`, `/operator/history`) can be installed as a phone app and keep working after signal drops. The RMO dashboard is intentionally **not** cached for offline use.

## What shipped

| Piece | Behavior |
|-------|----------|
| **Manifest** | `frontend/public/manifest.json` — `RMO Operator`, `start_url: /operator`, `display: standalone`, multi-size PNG icons under `/icons/` |
| **Service worker** | `frontend/public/sw.js` — runtime-caches operator navigations + `/_next/static/*` after first online visit; never caches `/api/*` |
| **Offline queue** | IndexedDB (`rmo-operator-offline`) stores report drafts + attachment blobs when submit fails or the device is offline; flushes via cookie-auth `POST /api/operator/submit-report` when back online |
| **UX** | Online/offline banner + pending-queue panel on operator pages; no raw “Failed to fetch” for network loss |

Auth is unchanged: httpOnly `rmo_session` cookie. The SW does not store tokens.

## Install (iOS Safari / Android Chrome)

1. Sign in at https://rmo.buildmyoffice.com as **Operator**.
2. Open `/operator` once while online (also open Submit report + History so they get cached).
3. **iOS Safari:** Share → **Add to Home Screen**.
4. **Android Chrome:** menu → **Install app** / **Add to Home Screen**.
5. Launch from the home-screen icon (standalone). You should land on `/operator`.

## Airplane-mode test

1. While online and signed in, visit `/operator`, `/operator/submit-report`, and `/operator/history`.
2. Enable Airplane Mode (or disable Wi‑Fi + cellular).
3. From the installed app (or a hard refresh on those routes), confirm operator pages still render (not a blank “failed to fetch” document).
4. Fill Submit report and tap **Save offline** / Submit — expect “Saved offline — will send when you’re back online.”
5. Optional: attach a small COI/permit/photo. Prefer files that fit IndexedDB; if storage fails, the UI says which names need re-attach.
6. Turn network back on — the pending banner should send queued reports automatically (or use **Send now**).
7. Confirm the new row on `/operator/history` and in the RMO inbox.

## Honest limits

- **First visit must be online** so the SW can cache the operator shell and JS chunks.
- **Soft client navigations** (Next.js RSC) can still fail offline; use home-screen launches, full page loads, or the plain links on Operator home.
- **History edits** need network; offline history is read-only from the last server-rendered visit.
- **Session cookies** still expire (~14 days). If login is required while offline, you must reconnect.
- **Dashboard** (`/dashboard*`) is not an offline product — only a generic offline fallback page if the network is gone.

## Dev notes

- SW registration runs in **production** builds only (`ServiceWorkerRegister`), so `next dev` HMR is not taken over.
- After deploy, bump `CACHE_VERSION` in `sw.js` if you need to force shell cache invalidation.
