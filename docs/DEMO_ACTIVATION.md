# Demo activation — CargoConnect

Operator guide for the **demo / presentation** environment.

Current CargoConnect is intended for:

- internal demonstration
- presentations
- controlled product walkthroughs
- development / testing

It is **NOT** currently intended for:

- persistent customer records
- multiple real concurrent users expecting durability
- production bookings
- legally important records
- reliable long-term shipment history

No new product features — this activates existing infrastructure.

## Prerequisites

| Dependency | Demo expectation |
|------------|------------------|
| **PostgreSQL** | **Intentionally deferred** — do not provision for this stage |
| Commercial persistence | **In-memory** (`COMMERCIAL_STORE=memory`) |
| Cloudflare R2 | Private bucket for document **objects** |
| Upstash Redis | Rate limiting only (not an app database) |
| Resend | Optional; `EMAIL_DELIVERY_MODE=log` OK |
| AISStream | Development/demo feed only |
| Malware scanner | Deferred — demo noop bypass |

## Demo persistence mode (actual code)

Supported commercial persistence modes in code:

| Mode | How selected |
|------|----------------|
| `memory` | `COMMERCIAL_STORE=memory`, or `NODE_ENV=test`, or **no** `DATABASE_URL` / no `COMMERCIAL_PERSISTENCE=postgres` |
| `postgres` | `DATABASE_URL` set **or** `COMMERCIAL_PERSISTENCE=postgres` |

There is **no** active JSON file commercial store (`COMMERCIAL_DATA_DIR` is unused).

### Recommended demo env

```env
DEMO_MODE=true
COMMERCIAL_STORE=memory
# Do NOT set DATABASE_URL
# Do NOT set COMMERCIAL_PERSISTENCE=postgres
```

`DATABASE_URL` is **not required** for demo. Absence is intentional, not a misconfiguration.

### Durability matrix

| Store | What it holds | Survives app restart? | Survives Render redeploy / new instance? |
|-------|---------------|----------------------|------------------------------------------|
| **MEMORY** (commercial repos) | Users, RFQs, quotes, bookings, metadata, claims, etc. | **No** | **No** (ephemeral process memory) |
| **FILE** (local disk) | Not used for commercial records | n/a | Render disk is **ephemeral** — do not rely on it |
| **R2** | Document binary objects | **Yes** | **Yes** (object storage) |
| **REDIS** (Upstash) | Rate-limit counters only | TTL-based | **Yes** (managed Redis), unrelated to commercial records |

On crash / `next dev` restart / Render replace: commercial demo state is cleared.
Document **files** already uploaded to R2 may remain as orphans until cleanup; DB/metadata links are gone with memory reset.

## Demo malware bypass

```env
MALWARE_SCAN_PROVIDER=noop
MALWARE_SCAN_ALLOW_NOOP=true
```

Readiness: `malwareMode=DEMO_BYPASS`. Not real protection.

### PRE-PRODUCTION GATE (malware)

Deploy HTTP/ClamAV scanner → `MALWARE_SCAN_PROVIDER=http` → remove `MALWARE_SCAN_ALLOW_NOOP`.

## R2 and Redis

Keep real integrations:

- **R2** → document object storage only
- **Upstash Redis** → rate limiting only

Do **not** use Redis as a substitute application database.
Do **not** move commercial records into R2.

## Demo reset / reproducibility

Primary Rotterdam → Alexandria scenario is covered by Vitest fixtures and seeded contacts.

Reset options:

1. **Restart the Node process** — clears in-memory commercial state; contacts reseed from `COMMERCIAL_CONTACTS`.
2. **Guarded reset** (never touches Postgres):

```bash
# In-process (local script)
DEMO_MODE=true COMMERCIAL_STORE=memory npx tsx scripts/demo-reset.ts --local

# Against running app (requires DEMO_RESET_SECRET or INTERNAL_OPS_SECRET ≥16 chars)
DEMO_MODE=true DEMO_RESET_SECRET=… npm run demo:reset
```

Endpoint: `POST /api/internal/demo/reset`  
Hard-refuses when `DATABASE_URL` is set or `COMMERCIAL_PERSISTENCE=postgres`.

## PostgreSQL migrations — deferred

Keep all of:

- Drizzle schema
- migrations through `0012_production_hardening.sql`
- Postgres repositories
- `npm run db:migrate` / `npm run db:status`

**Do not run migrations** for the current presentation demo.

### CONTROLLED PILOT GATE (PostgreSQL)

Before inviting real external users:

1. Provision PostgreSQL
2. Configure `DATABASE_URL`
3. Enable `COMMERCIAL_PERSISTENCE=postgres` (and stop forcing `COMMERCIAL_STORE=memory`)
4. Enable/take backups
5. Apply migrations through latest
6. Run `npm run db:status`
7. Full staging smoke test
8. Verify persistence across restart/redeploy

## Email / inbound / cron

See prior sections in this doc and [EMAIL_DELIVERY.md](./EMAIL_DELIVERY.md) / [INBOUND_EMAIL.md](./INBOUND_EMAIL.md).

- Demo email: `EMAIL_DELIVERY_MODE=log` → `DELIVERY_SIMULATED`
- Cron: **optional** for interactive demo; configure when background AIS observation is needed

```bash
npm run email:preflight
npm run demo:ready
```

## Health / readiness (demo)

```text
GET /api/health/live
GET /api/health/ready
```

Expected demo diagnostics:

| Signal | Demo value |
|--------|------------|
| Application | `ready` (HTTP 200) when R2/Redis healthy |
| Persistence | `DEMO` / provider `memory` |
| PostgreSQL | `DEFERRED` |
| Durability | `non-production` |
| R2 / storage | `ok` |
| Upstash / rateLimit | `ok` |
| Email | `DELIVERY_SIMULATED` |
| Malware | `DEMO_BYPASS` |
| AIS | `development` |
| Cron / watcher | `not_configured` unless cron has succeeded |

Do **not** interpret this as production database ready.

## Smoke / primary scenario

Rotterdam → Alexandria (fixtures):

Natural-language search → corridor → vessels → RFQ → broker response → compare → select → proceed → confirmation → booking → documents (R2) → handoff → tracking → exception → claim preparation → claim PDF.

Automated coverage: commercial / inbound / documents / handoff / execution / exceptions / claims Vitest suites (memory store).

## Production gates (still deferred — not demo blockers)

- PostgreSQL + backups
- Real malware scanner
- Live Resend outbound/inbound
- Production observation cron
- Commercially licensed AIS provider

## Related

- [DEMO_WALKTHROUGH.md](./DEMO_WALKTHROUGH.md) — 5–7 minute presenter script
- [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)
- [DATABASE.md](./DATABASE.md)
- [RENDER_DEPLOY.md](./RENDER_DEPLOY.md)
- [RUNBOOK.md](./RUNBOOK.md)
