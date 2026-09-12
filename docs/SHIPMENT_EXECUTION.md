# Shipment execution foundation

## Purpose

After `READY_FOR_OPERATIONS` and a **finalized** operational handoff, CargoConnect
can start **shipment tracking**.

This initializes a `ShipmentExecution` — it does **not** mean the vessel has
departed or that cargo is loaded.

## Operational vs observed status

| Kind | Examples | Who sets it |
| --- | --- | --- |
| Operational milestone | LOADED, DEPARTED, ARRIVED, DISCHARGED, DELIVERED | Explicit user confirmation |
| AIS observation | Vessel near origin, left area, at destination, stale | AIS / fixtures / watcher |
| Broker candidate | Email “vessel sailed…” | PENDING until user confirms |

**AIS never proves cargo loaded, discharged, or commercially completed.**

## Lifecycle (MVP)

`READY_FOR_OPERATIONS` → `LOADED` → `IN_TRANSIT` → `ARRIVED` → `DISCHARGED` → `DELIVERED` → `COMPLETED`

See [SHIPMENT_COMPLETION.md](./SHIPMENT_COMPLETION.md) for discharge/delivery/completion.

## Live observation watcher

`POST /api/internal/shipment-observation/run`  
Authorization: `Bearer <SHIPMENT_OBSERVATION_JOB_SECRET>`

Loads active (non-COMPLETED) executions, matches a shared maritime snapshot by MMSI/IMO,
applies the meaningful-change filter, then calls `ingestVesselObservation`.

After ingest, the same job runs **operational exception evaluation**
(`evaluateShipmentExceptions`) — see [OPERATIONAL_EXCEPTIONS.md](./OPERATIONAL_EXCEPTIONS.md).

Browser polling is **display-only** — not authoritative ingestion.

## Vessel association

Preference: **MMSI → IMO → confirmed vessel name**.

Ambiguous name matches require user confirmation. Vessel changes are never silent.

## Geofence / ETA / freshness

See [AIS_TRACKING.md](./AIS_TRACKING.md).

## Routes

- UI: `/commercial/bookings/[id]/tracking`, `/commercial/shipments`
- Tracking APIs under `/api/commercial/bookings/:id/tracking/*`
- Job: `/api/internal/shipment-observation/run`

## Related

- [SHIPMENT_COMPLETION.md](./SHIPMENT_COMPLETION.md)
- [OPERATIONAL_EXCEPTIONS.md](./OPERATIONAL_EXCEPTIONS.md)
- [CLAIMS_PREPARATION.md](./CLAIMS_PREPARATION.md)
- [AIS_TRACKING.md](./AIS_TRACKING.md)
- [OPERATIONAL_HANDOFF.md](./OPERATIONAL_HANDOFF.md)
- [DATABASE.md](./DATABASE.md)
