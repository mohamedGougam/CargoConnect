# AIS tracking (shipment observation)

## Provider independence

```
MaritimeDataProvider / AIS cache / fixtures
  → ShipmentObservationWatcher (shared snapshot)
  → ingestVesselObservation
  → ShipmentExecution
```

Do not couple execution logic to AISStream specifically. Production can switch to a
licensed provider without changing ShipmentExecution.

## Licensing

**AISStream remains prototype/development** unless commercial/public-display
licensing is explicitly confirmed. Production vessel tracking may require a
**licensed AIS provider**.

The tracking UI labels the feed as a development AIS source when using prototype config.

## Watcher scheduling

Protected job (server secret — never `NEXT_PUBLIC_`):

```
POST /api/internal/shipment-observation/run
Authorization: Bearer $SHIPMENT_OBSERVATION_JOB_SECRET
```

Suggested interval: `SHIPMENT_OBSERVATION_INTERVAL_SECONDS=300` (~5 minutes).

On Render: Cron Job or scheduled service hitting the internal endpoint.
Do **not** rely on a permanent background loop inside a serverless HTTP request.

Completed executions are excluded from the watcher.

## Operational exceptions

After observation ingest, the watcher evaluates attention rules (AIS stale, ETA
slippage, route deviation, dwell, etc.). See [OPERATIONAL_EXCEPTIONS.md](./OPERATIONAL_EXCEPTIONS.md).

## Meaningful change filter

Persists only when distance, speed, nav status, destination/ETA, freshness, or
interval warrants it — avoid identical-point spam.

## What AIS may show

- Vessel near origin / destination (approximate geofence)
- Vessel appears to have left origin area
- Underway position, SOG, COG, AIS destination/ETA text
- Stale signal

## What AIS must not do

- Auto-set LOADED / DEPARTED / ARRIVED / DISCHARGED / DELIVERED / COMPLETED
- Claim cargo delivery
- Trigger incident/emergency logic on stale signal

## Provider outage vs stale vessel

| Condition | Behavior |
| --- | --- |
| AIS provider unavailable | Keep prior observations; mark provider temporarily unavailable; do not invent stale events for every execution |
| Vessel AIS signal stale | Label observation stale when a recent position ages out |

## Fixtures (tests / local)

Deterministic scenarios: `NEAR_ROTTERDAM`, `LEFT_ROTTERDAM`, `UNDERWAY_MED`,
`NEAR_ALEXANDRIA`, `STALE`, `VESSEL_CHANGE_ORION`.

Production: fixture POST disabled unless `SHIPMENT_AIS_FIXTURES=true`.

## Retention

Meaningful observations + bounded periodic tracks
(`SHIPMENT_OBSERVATION_MAX_PER_EXECUTION`, default 200).
Oldest rows pruned — not an unbounded AIS firehose.
On completion, keep enough history for the final track; never prune milestone evidence.

## Related

- [SHIPMENT_EXECUTION.md](./SHIPMENT_EXECUTION.md)
- [SHIPMENT_COMPLETION.md](./SHIPMENT_COMPLETION.md)
