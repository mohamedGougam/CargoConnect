# Operational handoff

## Purpose

When a booking is `READY_FOR_OPERATIONS`, CargoConnect can consolidate commercial
and document state into an **Operational Handoff** package.

It answers: what is shipped, route, commercial terms, vessel (if known),
documents available, remaining warnings/missing info, and references for ops.

## What it is / is not

**Is:** a CargoConnect operational summary for handoff readiness.

**Is not:** a bill of lading, customs declaration, legal transport contract,
or carrier-issued booking confirmation.

## Lifecycle

`DRAFT` / `READY_FOR_REVIEW` → explicit acknowledgements → `FINALIZED`

Finalized versions are **immutable**. Document or booking changes after
finalization do not rewrite v1 — create a new version (`v2`, …).

User-facing reference: `HO-{bookingReference}-V{n}` e.g. `HO-CC-2026-000123-V1`.

## Content

Persisted snapshot includes booking, commercial terms (with provenance),
shipment, vessel, contacts, document manifest (metadata only — no binaries),
warnings (`INFO` / `WARNING` / `CRITICAL`), missing information, optional
ops contact + user-entered notes, and a deterministic short summary.

## Recheck

Create / finalize re-validates:

- ownership
- `READY_FOR_OPERATIONS`
- document completeness (no unresolved critical blockers)

Failure code: `HANDOFF_NOT_READY`.

## PDF

Server-side (`pdf-lib`). Filename:
`CargoConnect-Handoff-{bookingRef}-v{n}.pdf`.

No private storage URLs, storage keys, or secrets in the PDF.

## Routes

- UI: `/commercial/bookings/[id]/handoff`
- `GET/POST /api/commercial/bookings/:id/handoff`
- `POST /api/commercial/bookings/:id/handoff/finalize`
- `GET /api/commercial/bookings/:id/handoff/pdf`

## After finalization

Users may **Start Shipment Tracking** when booking is `READY_FOR_OPERATIONS`
and handoff is `FINALIZED`. See [SHIPMENT_EXECUTION.md](./SHIPMENT_EXECUTION.md).

## Known limitations

- No ZIP document package in this iteration (PDF-only export)
- Terminals / IMO often listed as missing when unknown
- Summary is deterministic from structured facts — not LLM authority
- Not an execution or customs workflow

## Related

- [DOCUMENT_WORKFLOW.md](./DOCUMENT_WORKFLOW.md)
- [BOOKING_FOUNDATION.md](./BOOKING_FOUNDATION.md)
- [DATABASE.md](./DATABASE.md)
