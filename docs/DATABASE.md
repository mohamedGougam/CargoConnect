# Database (Postgres)

## Choice

**PostgreSQL + Drizzle ORM + `postgres.js`**

- Type-safe schema in TypeScript
- Explicit SQL migrations (no auto-migrate on request)
- Lightweight vs Prisma for this MVP
- Works on Render Postgres without tying commercial data to ephemeral disk

JSON file store is **no longer** an active path. **In-memory** repositories are the
supported non-Postgres mode (tests, local, and **presentation demo** without `DATABASE_URL`).

PostgreSQL remains the **controlled pilot / production** persistence path. Migrations
through `0012` are retained but **deferred** until pilot activation — see
[DEMO_ACTIVATION.md](./DEMO_ACTIVATION.md).

## Environment

```
# Demo / presentation (current stage):
DEMO_MODE=true
COMMERCIAL_STORE=memory
# Do not set DATABASE_URL

# Controlled pilot / production:
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/cargoconnect
COMMERCIAL_PERSISTENCE=postgres   # optional; auto when DATABASE_URL is set
AUTH_SECRET=...                   # session signing (min 32 chars in production)
```
## Commands

```bash
# Apply pending migrations (tracks schema_migrations)
npm run db:migrate

# Report applied vs pending (no mutation)
npm run db:status

# Seed curated commercial contacts (no fabricated emails)
npm run db:seed
```

Requires `DATABASE_URL` (e.g. in `.env.local`).

## Users

Fresh Postgres environments start with **no users** — re-register via `/auth`.
Local JSON users are not auto-migrated.

## Schema overview

- `users` (includes `email_verified_at`)
- `email_verification_tokens` (hashed single-use tokens)
- `commercial_intents`
- `commercial_requests` (JSON payload + indexed status/user)
- `commercial_contacts`
- `commercial_messages` (OUTBOUND + INBOUND; nullable request id for unmatched)
- `commercial_message_attachments` (metadata only)
- `commercial_quotes` (JSON payload; versioning/corrections/status in payload)
- `commercial_quote_selections` (active selection + lock after proceed)
- `commercial_proceed_requests` (immutable snapshot + outbound proceed draft/send state)
- `commercial_confirmations` (extracted proceed replies + diffs; never auto-book)
- `bookings` (one per request after explicit commercial acknowledgement; unique reference)
- `accepted_commercial_snapshots` (changed-terms acceptance history)
- `booking_document_requirements`
- `booking_documents` (metadata + storage key; binaries in object storage)
- `document_validation_results`
- `operational_handoffs` (versioned, immutable when FINALIZED)
- `shipment_executions`
- `shipment_milestones`
- `shipment_milestone_candidates` (broker/AIS suggestions — never auto-confirmed)
- `operational_exceptions` (attention items — not incidents)
- `claim_preparations` / `claim_evidence_items` (evidence dossiers — not liability)
- `shipment_vessel_associations`
- `shipment_observations` (bounded retention)
- `audit_events` (`commercial_request_id` nullable for user-level events)
- `schema_migrations` (migration ledger)
- `job_leases` / `operational_job_runs` (cron overlap protection + run history)

Migrations: `drizzle/0000_*.sql` … `0012_production_hardening.sql`.

Connection tuning (optional): `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_SECONDS`, `DB_CONNECT_TIMEOUT_SECONDS`.

See [SHIPMENT_EXECUTION.md](./SHIPMENT_EXECUTION.md), [SHIPMENT_COMPLETION.md](./SHIPMENT_COMPLETION.md), [OPERATIONAL_EXCEPTIONS.md](./OPERATIONAL_EXCEPTIONS.md), [CLAIMS_PREPARATION.md](./CLAIMS_PREPARATION.md), and [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md).

### Why normalized selection / proceed / confirmation / booking tables?

These are **core commercial state**, not ephemeral UI. Dedicated tables keep:

- clear ownership and auditability
- immutable proceed + booking snapshots
- separate status/idempotency from the original RFQ send
- at-most-one booking per request (unique index)

Quote comparison fields live in the quote JSON payload — see [QUOTE_COMPARISON.md](./QUOTE_COMPARISON.md).  
Selection / proceed — [QUOTE_SELECTION.md](./QUOTE_SELECTION.md).  
Confirmation / booking — [COMMERCIAL_CONFIRMATION.md](./COMMERCIAL_CONFIRMATION.md), [BOOKING_FOUNDATION.md](./BOOKING_FOUNDATION.md).

## Render

1. Create a Render Postgres instance  
2. Copy Internal/External `DATABASE_URL` into the Web Service env  
3. Run migrate + seed once (Render Shell or local against that URL)  
4. Redeploy the app  

Do **not** run migrations automatically on every HTTP request.
