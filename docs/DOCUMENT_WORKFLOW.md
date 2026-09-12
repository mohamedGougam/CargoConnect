# Document workflow & operational readiness

## Changed-terms acceptance

When a broker reply is `TERMS_CHANGED`:

1. User reviews original proceed snapshot vs broker terms + diffs
2. Explicit acknowledgements
3. **Accept Changed Terms**
4. Immutable `AcceptedCommercialSnapshot` (previous + accepted terms)
5. Booking created with **accepted** commercial snapshot
6. Original `ProceedSnapshot` remains unchanged

Clean confirmations still use **Confirm Commercial Agreement**.

## Document checklist

After commercial confirmation, CargoConnect generates a **CargoConnect document checklist**
(not a legally complete customs package).

Typical required:

- Commercial Invoice
- Packing List
- Bill of Lading Instructions

Optional: Certificate of Origin  
Broker-requested / DG / project cargo may add further types.

## Storage

| Provider | Use |
| --- | --- |
| `local` | Dev/tests under `.data/documents` (ignored by git) |
| `s3` | Production private object storage (S3 / R2 / MinIO) |

- Binaries are **not** stored in Postgres
- Keys are server-generated (`bookings/{bookingId}/{docId}/{filename}`)
- Downloads are authenticated streaming — no public URLs
- Malware scan lifecycle: `PENDING_SCAN` → `CLEAN` | `INFECTED` | `SCAN_FAILED`
- Infected files are quarantined, not downloadable, and excluded from readiness/claims
- `MALWARE_SCAN_PROVIDER=noop` is a labeled development bypass; production should use `http`

## Validation

Deterministic checks: non-empty file, type allowlist, lightweight text extraction,
consistency vs booking (e.g. weight mismatch → WARNING).

Does **not** claim regulatory approval. Language: “Checks passed” / “Review required”.
Malware scan is independent of business validation.

## Completeness vs readiness

Completeness = required uploads without unresolved critical issues **and** `scanStatus=CLEAN`.

`READY_FOR_OPERATIONS` only after:

- completeness satisfied
- explicit user acknowledgements
- **Mark Ready for Operations**

100% upload alone does not auto-ready.

## Status

`COMMERCIALLY_CONFIRMED` → `DOCUMENTS_PENDING` → `READY_FOR_OPERATIONS`

## Versioning

Replacements create a new version; prior versions remain (`isCurrent=false`).

After readiness, prefer versioned replace over destructive delete.

## Operational readiness

After `READY_FOR_OPERATIONS`, users can create an **Operational Handoff**
package (review → finalize → PDF). See [OPERATIONAL_HANDOFF.md](./OPERATIONAL_HANDOFF.md).

## Related

- [BOOKING_FOUNDATION.md](./BOOKING_FOUNDATION.md)
- [COMMERCIAL_CONFIRMATION.md](./COMMERCIAL_CONFIRMATION.md)
- [DATABASE.md](./DATABASE.md)
- [OPERATIONAL_HANDOFF.md](./OPERATIONAL_HANDOFF.md)
