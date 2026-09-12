# Production readiness

Operational checklist for deploying CargoConnect with real users.
Product workflows are unchanged — this document covers infrastructure confidence.

> **Current stage:** DEMO / PRESENTATION — see [DEMO_ACTIVATION.md](./DEMO_ACTIVATION.md).
> PostgreSQL, real malware scanning, live email, production cron, and licensed AIS are
> **deferred gates**, not current demo blockers.

## Pre-deploy checklist

### INFRA
- [ ] **Demo (now):** in-memory commercial persistence (`COMMERCIAL_STORE=memory`, no `DATABASE_URL`)
- [ ] **Pilot gate:** Postgres instance provisioned + automated backups
- [ ] Private object storage bucket (no public ACL) — R2 validated for demo
- [ ] Redis / Upstash configured for rate limits (not used as app DB)
- [ ] **Demo:** malware noop bypass (`MALWARE_SCAN_PROVIDER=noop` + `MALWARE_SCAN_ALLOW_NOOP=true`)
- [ ] **Pre-production gate:** real malware scanner (`MALWARE_SCAN_PROVIDER=http` + URL); **remove** `MALWARE_SCAN_ALLOW_NOOP`
- [ ] Resend verified sending domain (optional until live email)
- [ ] Inbound email domain + webhook secret (optional until live inbound)
- [ ] Cron for shipment observation watcher (optional for interactive demo)

### APP
- [ ] **Demo:** skip migrations; keep drizzle/`db:migrate`/`db:status` for later
- [ ] **Pilot:** `npm run db:migrate` through latest; `npm run db:status` clean
- [ ] Secrets configured (see `.env.example` groups)
- [ ] `APP_BASE_URL` matches public HTTPS origin (when using verification links)
- [ ] `/api/health/live` returns 200
- [ ] `/api/health/ready` returns 200 with `persistence=DEMO` / `postgresql=DEFERRED` in demo
- [ ] Demo smoke / Vitest commercial suites passed

### AIS
- [ ] Development / demo AIS feed clearly labeled in UI
- [ ] `AIS_PROVIDER_MODE=development` unless licensed provider confirmed
- [ ] Commercial AIS launch gate acknowledged (do not treat AISStream as licensed by default)

## Controlled pilot gate — PostgreSQL

Before inviting real external users:

1. Provision PostgreSQL
2. Configure `DATABASE_URL`
3. Set `COMMERCIAL_PERSISTENCE=postgres` and stop forcing `COMMERCIAL_STORE=memory`
4. Enable/take backups
5. Apply migrations through latest (`0012+`)
6. `npm run db:status`
7. Full staging smoke test
8. Verify persistence across restart/redeploy

Do not treat missing Postgres as a demo failure.
## Health endpoints

| Path | Meaning |
|------|---------|
| `/api/health` | Legacy liveness alias |
| `/api/health/live` | Process up — no dependency checks |
| `/api/health/ready` | DB / storage / email config / rate-limit / malware / AIS / watcher |

Ready returns HTTP **503** when essential dependencies fail (e.g. required Postgres or S3).

Optional: `Authorization: Bearer $INTERNAL_OPS_SECRET` includes metric counters.

## CSRF posture

Authenticated mutating APIs use **HttpOnly** session cookies with **SameSite=Lax**.
Cross-site browser POSTs do not include the cookie under Lax for our same-origin SPA model.
High-risk routes (auth, uploads) also check `Origin` against `APP_BASE_URL` / `TRUSTED_ORIGINS` when present.
CSRF tokens are intentionally not added to every JSON API.

## Rate limiting

Provider abstraction: `RATE_LIMIT_PROVIDER=memory|redis`

Redis options:
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- or `REDIS_URL` (Redis/Valkey)

Failure policy (per endpoint):
- login/signup/upload/email → conservative memory fallback
- internal job / inbound fixture → fail closed
- maritime search → fail open

## Malware scanning

`MALWARE_SCAN_PROVIDER=noop|http`

- **noop** (default): labeled bypass for local/tests/demo.
  - Demo: set `MALWARE_SCAN_ALLOW_NOOP=true` so uploads can reach `CLEAN` without ClamAV.
  - Readiness reports `malwareMode=DEMO_BYPASS` — **not** real protection.
  - Production without allow marks noop “clean” as `SCAN_FAILED` (not silently clean).
- **http**: POST multipart to `MALWARE_SCAN_URL` (ClamAV gateway or compatible service).

### Pre-production gate (malware)

Deploying the real HTTP/ClamAV scanner is a **pre-production gate**, not a current demo blocker.
Before pilot/production: deploy scanner → `MALWARE_SCAN_PROVIDER=http` → remove `MALWARE_SCAN_ALLOW_NOOP`.

Document lifecycle: `PENDING_SCAN` → `CLEAN` | `INFECTED` | `SCAN_FAILED`.
Infected files are quarantined, blocked from download, excluded from readiness and claims evidence.

## AIS commercial-launch gate

Before production commercial vessel tracking:
1. Confirm AISStream commercial/public-display terms **in writing**, **or**
2. Configure a licensed provider through the existing maritime data provider abstraction.

Set `AIS_PROVIDER_MODE=licensed` only after operator confirmation.
No code rewrite should be required to swap labeling.

## Staging smoke test (fixture-friendly)

1. Create account + verify email (log mode OK)
2. Search a route
3. Create commercial request → simulate/send
4. Inbound broker fixture reply
5. Compare → select → proceed → confirm
6. Booking → upload clean documents → validate → mark ready
7. Finalize handoff PDF
8. Start shipment tracking → ingest demo AIS → confirm milestones
9. Create operational exception → claim preparation → finalize claim PDF

Do not require live broker participation.

## Minimal production smoke (non-destructive)

1. `GET /api/health/live`
2. `GET /api/health/ready`
3. Login
4. Confirm DB-backed list endpoints for own data
5. Storage health via readiness
6. Email config status via readiness
7. AIS watcher health via readiness / last cron success
8. Avoid creating unnecessary commercial actions in live prod

## Migration order

1. Backup database
2. `npm run db:status`
3. `npm run db:migrate`
4. `npm run db:status` (no pending)
5. Deploy application
6. Hit readiness
7. Decide rollback only if essential components fail

Migrations through `0012` are additive / `IF NOT EXISTS` friendly.

## Secret rotation

| Secret | Impact |
|--------|--------|
| `AUTH_SECRET` | Invalidates all sessions (users must re-login) |
| `EMAIL_API_KEY` | Outbound email fails until updated |
| `EMAIL_WEBHOOK_SECRET` | Inbound webhooks reject until Resend + app match |
| Storage keys | Uploads/downloads fail until updated |
| Redis credentials | Rate limiter degrades per policy |
| `SHIPMENT_OBSERVATION_JOB_SECRET` | Cron must be updated simultaneously |

## Data retention (operational defaults)

Pending formal legal policy. Current operational assumptions:

| Data | Default assumption |
|------|-------------------|
| Accounts | Retained while account exists |
| Commercial requests / emails | Retained with booking lifecycle |
| Uploaded documents | Retained with booking; superseded versions kept |
| AIS observations | Bounded per execution config |
| Audit logs | Retained for operational investigation |
| Exceptions / claims dossiers | Retained with booking |

Do not treat this as a compliance retention schedule.

## Related docs

- [DEMO_ACTIVATION.md](./DEMO_ACTIVATION.md)
- [RUNBOOK.md](./RUNBOOK.md)
- [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [DATABASE.md](./DATABASE.md)
