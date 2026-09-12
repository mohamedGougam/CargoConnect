# Operational exceptions

## Observation vs exception

| Concept | Meaning |
| --- | --- |
| **Observation** | Something CargoConnect sees (AIS point, email phrase, document status) |
| **Operational exception** | A deterministic rule decides the observation may deserve attention |
| **Incident** | Not implemented — do not treat exceptions as incidents |

CargoConnect **detects → explains → shows evidence → suggests next actions**.
It does **not** take commercial or operational action automatically.

## Model

`OperationalException` with severity `INFO | WARNING | HIGH`, status
`OPEN | ACKNOWLEDGED | RESOLVED | DISMISSED`, evidence[], recommendedActions[],
and a stable `logicalKey` for deduplication.

## Types (v1)

| Type | Meaning |
| --- | --- |
| `AIS_STALE` | No recent AIS beyond threshold while shipment is active |
| `ETA_SLIPPAGE` | Planned/confirmed ETA vs AIS ETA differ beyond threshold |
| `ROUTE_DEVIATION` | Position far from shipment **reference** corridor |
| `VESSEL_SUBSTITUTION` | Broker email reports a different vessel |
| `SOURCE_CONFLICT` | Broker update conflicts with AIS evidence |
| `ORIGIN_DWELL` | Loaded, not departed, still near origin past threshold |
| `DESTINATION_DWELL` | Arrived, discharge unconfirmed past threshold |
| `DOCUMENT_REGRESSION` | Required document missing/failed after operational readiness |
| `MILESTONE_OVERDUE` | Known planned milestone time passed without confirmation |

## Rule engine

`evaluateShipmentExceptions(executionId)` runs after the observation watcher
ingest pass (same job — no second scheduler).

Email processing evaluates the related booking only (substitution + conflicts).
Document upload may trigger evaluation for regression.

## Dedupe / auto-resolution

Active exceptions keyed by `logicalKey`. Re-detection updates evidence/`lastSeenAt`.

Safe auto-resolve when condition clears: `AIS_STALE`, `ETA_SLIPPAGE`,
`ROUTE_DEVIATION`, `ORIGIN_DWELL`, `DESTINATION_DWELL`, `MILESTONE_OVERDUE`.

Never auto-resolve without user review: `VESSEL_SUBSTITUTION`, `SOURCE_CONFLICT`,
`DOCUMENT_REGRESSION`.

## User actions

- **Acknowledge** — I have seen this
- **Dismiss** — does not require further attention (note required for HIGH)
- **Mark Resolved** — user closes with optional note

History is preserved (never deleted).

## Thresholds (server only)

```
SHIPMENT_EXCEPTION_AIS_STALE_MINUTES=60
SHIPMENT_EXCEPTION_ETA_SLIPPAGE_MINUTES=360
SHIPMENT_EXCEPTION_ROUTE_DEVIATION_KM=80
SHIPMENT_ROUTE_DEVIATION_KM=80
SHIPMENT_EXCEPTION_ORIGIN_DWELL_HOURS=12
SHIPMENT_EXCEPTION_DESTINATION_DWELL_HOURS=12
SHIPMENT_EXCEPTION_MILESTONE_GRACE_MINUTES=120
```

## APIs

Under booking ownership:

- `GET /api/commercial/bookings/:id/exceptions`
- `POST .../exceptions/:exceptionId/acknowledge`
- `POST .../exceptions/:exceptionId/dismiss`
- `POST .../exceptions/:exceptionId/resolve`

## Completed shipments

No new live AIS/ETA/route exceptions after `COMPLETED`. History remains visible.

## Claim preparation

From WARNING/HIGH exceptions, users may explicitly start **Prepare Claim Evidence**.
Exceptions never auto-create claims. See [CLAIMS_PREPARATION.md](./CLAIMS_PREPARATION.md).

## Limitations

- Not predictive ETA / ML
- Not claims, demurrage, insurance, or automatic carrier emails
- Neutral wording only — no “vessel lost” / “off course” safety language
- AISStream remains prototype unless licensing confirmed

## Related

- [SHIPMENT_EXECUTION.md](./SHIPMENT_EXECUTION.md)
- [AIS_TRACKING.md](./AIS_TRACKING.md)
- [SHIPMENT_COMPLETION.md](./SHIPMENT_COMPLETION.md)
