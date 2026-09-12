# Deployment notes (documents + handoff)

Production document binaries must use durable private object storage
(`DOCUMENT_STORAGE_PROVIDER=s3`), not Render’s ephemeral filesystem.

Operational handoff PDFs are generated in-process with `pdf-lib` — no SaaS API
or extra secrets required.

See [RENDER_DEPLOY.md](./RENDER_DEPLOY.md) for the full Render checklist,
[DOCUMENT_WORKFLOW.md](./DOCUMENT_WORKFLOW.md) for storage semantics, and
[OPERATIONAL_HANDOFF.md](./OPERATIONAL_HANDOFF.md) for handoff/PDF behavior.

Local/dev: `DOCUMENT_STORAGE_PROVIDER=local` stores under `.data/documents`
(gitignored). Configure `MALWARE_SCAN_PROVIDER=http` for production scanning
(noop is labeled bypass for local/tests only).

Apply migrations through `0012_production_hardening.sql` via `npm run db:migrate`.
Check with `npm run db:status`.

See also [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md), [RUNBOOK.md](./RUNBOOK.md),
and [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md).

Optional shipment/AIS tuning (server only):

```
SHIPMENT_GEOFENCE_RADIUS_KM=40
SHIPMENT_OBSERVATION_MAX_PER_EXECUTION=200
SHIPMENT_OBSERVATION_PERIODIC_MS=1800000
SHIPMENT_OBSERVATION_INTERVAL_SECONDS=300
SHIPMENT_OBSERVATION_JOB_SECRET=<long random secret>
SHIPMENT_EXCEPTION_AIS_STALE_MINUTES=60
SHIPMENT_EXCEPTION_ETA_SLIPPAGE_MINUTES=360
SHIPMENT_EXCEPTION_ROUTE_DEVIATION_KM=80
SHIPMENT_EXCEPTION_ORIGIN_DWELL_HOURS=12
SHIPMENT_EXCEPTION_DESTINATION_DWELL_HOURS=12
SHIPMENT_EXCEPTION_MILESTONE_GRACE_MINUTES=120
AIS_FRESHNESS_RECENT_MS=900000
AIS_FRESHNESS_DELAYED_MS=3600000
SHIPMENT_AIS_FIXTURES=false
```

### Observation watcher cron

Schedule (≈ every 5 minutes) a POST to:

`https://{APP_BASE_URL}/api/internal/shipment-observation/run`

with header `Authorization: Bearer $SHIPMENT_OBSERVATION_JOB_SECRET`.

On Render: use a Cron Job. Do not run a permanent loop inside the web process.

See [AIS_TRACKING.md](./AIS_TRACKING.md) and [SHIPMENT_COMPLETION.md](./SHIPMENT_COMPLETION.md).

AISStream licensing constraint unchanged — see [AIS_TRACKING.md](./AIS_TRACKING.md).
