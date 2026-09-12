# Runbook

Symptom → check → safe action. Do **not** delete customer bookings/documents to “fix” infra.

## App unavailable

**Symptom:** HTTP 5xx / blank site  
**Checks:** Render/host status, `/api/health/live`, recent deploy logs  
**Safe action:** Roll back last deploy if health live fails; do not run destructive SQL  
**Avoid:** Force-pushing secrets into client env (`NEXT_PUBLIC_`)

## Database unavailable

**Symptom:** Ready shows `database: error`, commercial APIs 500  
**Checks:** `DATABASE_URL`, provider status, connection limits (`DB_POOL_MAX`)  
**Safe action:** Scale connections down; restore from backup if corrupted (see DISASTER_RECOVERY)  
**Avoid:** Dropping tables; running migrate against wrong database

## Storage unavailable

**Symptom:** Uploads fail (`storage_unavailable`), ready storage error  
**Checks:** bucket private ACL, access keys, endpoint/region  
**Safe action:** Restore credentials; retry uploads; run orphan cleanup dry-run later  
**Avoid:** Making the bucket public

## Email provider down

**Symptom:** Outbound send failures; verification not arriving  
**Checks:** Resend status, `EMAIL_API_KEY`, domain DNS  
**Safe action:** Switch `EMAIL_DELIVERY_MODE=log` only for emergency staging diagnosis — not production customer traffic  
**Avoid:** Auto-resending commercial RFQs without idempotency confirmation

## Inbound webhook failure

**Symptom:** Broker replies missing  
**Checks:** `EMAIL_WEBHOOK_SECRET`, Svix signature errors, payload size  
**Safe action:** Fix secret; ask provider to retry; inspect duplicate rejection metrics  
**Avoid:** Disabling signature verification

## Redis unavailable

**Symptom:** Ready `rateLimit: degraded`; possible 429 spikes  
**Checks:** Upstash/Redis URL; rate-limit logs `rate_limit.provider_failure`  
**Safe action:** Auth/upload fall back to local memory; internal jobs fail closed  
**Avoid:** Removing rate limits entirely on auth

## Malware scanner unavailable

**Symptom:** Uploads `SCAN_FAILED` / readiness blocked  
**Checks:** `MALWARE_SCAN_URL`, scanner health  
**Safe action:** Keep documents pending — never mark clean without a scan in production  
**Avoid:** Setting `MALWARE_SCAN_ALLOW_NOOP=true` in production except documented emergency

## AIS provider unavailable

**Symptom:** Watcher `providerAvailable: false`  
**Checks:** AISStream key/enabled flags; remember development mode labeling  
**Safe action:** Shipments remain usable with last observation; fixtures for staging  
**Avoid:** Claiming licensed tracking while `AIS_PROVIDER_MODE=development`

## Shipment watcher stale

**Symptom:** Ready `shipmentWatcher: degraded`  
**Checks:** Cron schedule, job secret, overlapping lease skips  
**Safe action:** Manually POST watcher with bearer secret once; inspect lease held responses  
**Avoid:** Running many parallel crons without lease TTL awareness

## Failed migration

**Symptom:** Deploy broken after migrate  
**Checks:** `npm run db:status`, migration logs  
**Safe action:** Restore backup if schema half-applied and unknown; re-run only after restore plan  
**Avoid:** Hand-editing production schema without recording in `schema_migrations`

## PDF generation failures

**Symptom:** Claim/handoff PDF 500/404  
**Checks:** Logs `pdf.claim_failed` / `pdf.handoff_failed`; source dossier still intact  
**Safe action:** Retry PDF; finalized snapshots must remain immutable  
**Avoid:** Re-finalizing claims to “fix” PDF

## Recommended alerts

**HIGH:** readiness failing > 5 min; DB/storage down; malware unavailable in production; repeated webhook 401/5xx  
**WARNING:** watcher stale; AIS unavailable; high email failure rate; Redis fallback active

## Related

- [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)
- [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md)
