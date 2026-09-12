# Claims preparation

## Purpose

CargoConnect helps users **prepare evidence** when a shipment has an
operational or commercial issue.

It does **not**:
- determine legal liability
- approve claims
- calculate damages owed
- submit to carriers or insurers
- settle or pay anything

Terminology used: Claim Preparation, Claim Candidate, Evidence Package,
Claim Dossier, Potential Claim Amount (user-supplied).

## Flow

1. User explicitly creates a claim preparation (from exception, booking, or shipment)
2. Server collects source-linked evidence
3. Deterministic factual timeline + elapsed durations
4. Missing-evidence checklist + warnings
5. Optional user-entered potential amount
6. User reviews / includes-excludes evidence
7. Finalize with acknowledgements → immutable dossier
8. Export PDF

## Claim types

`DELAY`, `DEMURRAGE_PREPARATION`, `VESSEL_SUBSTITUTION`, `MILESTONE_DISPUTE`,
`DOCUMENT_DISPUTE`, `DELIVERY_DELAY`, `OTHER`

`DEMURRAGE_PREPARATION` collects facts and elapsed times only — no payable
demurrage calculation.

## Evidence

Items reference existing records (booking, commercial snapshot, emails,
documents, handoff, milestones, AIS observations, exceptions). Originals are
never mutated. Client cannot inject forged AIS/email/milestone sources.

## Timeline & conflicts

Chronological, source-grounded. Conflicting timestamps are preserved side by
side. Duration labels use neutral wording (“Observed arrival difference”,
“Potential timing discrepancy”).

## Finalization & versioning

Requires:
- review acknowledgement
- no-liability acknowledgement

Finalized dossiers are immutable. New evidence → **Create New Version** (v2+),
never rewrite v1.

## PDF

`GET /api/commercial/claims/:id/pdf`  
Filename: `CargoConnect-Claim-{reference}-v{n}.pdf`  
Footer disclaimer included. No private storage keys.

## Security

Authentication + booking/claim ownership. No public evidence URLs.

**View Source** on the claim review page opens the existing authenticated
booking/documents/handoff/tracking surfaces (including `?exceptionId=` for
exceptions). Original source records are never mutated.

## Related

- [OPERATIONAL_EXCEPTIONS.md](./OPERATIONAL_EXCEPTIONS.md)
- [SHIPMENT_EXECUTION.md](./SHIPMENT_EXECUTION.md)
- [DATABASE.md](./DATABASE.md)
