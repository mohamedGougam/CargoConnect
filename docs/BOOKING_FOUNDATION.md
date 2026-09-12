# Booking foundation

## What a Booking is

After the user explicitly acknowledges a **clean** broker/carrier confirmation, CargoConnect creates a `Booking` record.

It means:

- a quote was selected
- a proceed request was sent
- a confirmation was reviewed
- the user acknowledged commercial terms

It does **not** mean:

- payment collected
- escrow funded
- invoice issued
- CargoConnect is the carrier
- shipment execution started

## Reference

User-facing: `CC-{year}-{6-digit sequence}` e.g. `CC-2026-000123`

External broker/carrier reference stored separately (`externalBookingReference`).

Uniqueness: unique index on `booking_reference` and on `commercial_request_id` (one booking per request at this stage).

## Snapshots

At creation the booking freezes:

- cargo
- proceed / selected commercial terms (`commercialSnapshot`)
- confirmation payload (`confirmationSnapshot`)
- vessel (if present)

Later edits to quotes/confirmations do not rewrite booking history.

## After commercial confirmation

Booking moves to `DOCUMENTS_PENDING` with a generated checklist.
User uploads private documents, resolves warnings, then explicitly marks
`READY_FOR_OPERATIONS`. See [DOCUMENT_WORKFLOW.md](./DOCUMENT_WORKFLOW.md).

Changed-terms path: explicit **Accept Changed Terms** creates an
`AcceptedCommercialSnapshot` then booking — original proceed snapshot stays immutable.

After `READY_FOR_OPERATIONS`, see [OPERATIONAL_HANDOFF.md](./OPERATIONAL_HANDOFF.md).

## Routes

- `/commercial/bookings` — list
- `/commercial/bookings/[id]` — detail
- `/commercial/bookings/[id]/documents` — document workspace
- `/commercial/bookings/[id]/handoff` — operational handoff
- `/commercial/bookings/[id]/tracking` — shipment execution tracking

After finalized handoff, see [SHIPMENT_EXECUTION.md](./SHIPMENT_EXECUTION.md).

## Idempotency

Double-click on Confirm Commercial Agreement claims the confirmation once and uses unique request→booking constraint — no duplicate bookings.

## Related

- [COMMERCIAL_CONFIRMATION.md](./COMMERCIAL_CONFIRMATION.md)
- [DOCUMENT_WORKFLOW.md](./DOCUMENT_WORKFLOW.md)
- [OPERATIONAL_HANDOFF.md](./OPERATIONAL_HANDOFF.md)
- [DATABASE.md](./DATABASE.md)
