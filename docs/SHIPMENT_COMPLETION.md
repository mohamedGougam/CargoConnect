# Shipment completion

## States

After arrival:

`ARRIVED` → `DISCHARGED` → `DELIVERED` → `COMPLETED`

Each cargo event requires **explicit user confirmation**.
AIS and broker email never auto-confirm discharge/delivery.

## Sequence

Default order:

LOADED → DEPARTED → ARRIVED → DISCHARGED → DELIVERED → COMPLETED

Out-of-order confirmation is rejected (`invalid_order`).

## Completion

After `DELIVERED`, user must acknowledge:

“I confirm that the shipment execution is complete.”

Then `Complete Shipment` → `COMPLETED` with `closeoutSummary`.

Completed executions leave the observation watcher and milestone mutations are blocked.

## Broker email candidates

Inbound phrases create `PENDING` candidates (arrival, discharge, delivery, etc.).
User confirms or dismisses. Evidence references the inbound message id — email remains source of truth.

## Related

- [SHIPMENT_EXECUTION.md](./SHIPMENT_EXECUTION.md)
- [OPERATIONAL_EXCEPTIONS.md](./OPERATIONAL_EXCEPTIONS.md)
