# Quote selection & Request to Proceed

## What “Select This Quote” means

The user chooses one structured quote from comparison as the commercial option they want to pursue.

Selection is **persisted** (`commercial_quote_selections`). It is not UI-only state.

Selection does **not**:

- confirm a booking
- accept the quote on the broker’s behalf
- send email automatically
- guarantee vessel availability

## What “Request to Proceed” means

After review, the user explicitly asks CargoConnect to email the broker/carrier:

> We would like to proceed based on your quotation… subject to your confirmation.

This is an **acceptance-intent / proceed request**, not a confirmed booking.

Correct post-send language:

- Proceed Request Sent
- Awaiting Broker Confirmation

Incorrect until a later phase explicitly confirms:

- Booking Confirmed
- Book Now / Accept & Book

## Flow

```
Compare Quotes
→ Select This Quote          → status QUOTE_SELECTED
→ Review / Request to Proceed (/commercial/requests/:id/proceed)
→ acknowledgements + editable message
→ Send                       → PROCEED_SENDING → AWAITING_CONFIRMATION
```

## Snapshot

At prepare/send time, terms are copied into an immutable `ProceedSnapshot` on `commercial_proceed_requests`:

rate, currency, estimated freight, laycan, transit, validity, inclusions/exclusions, payment terms, vessel (if known), quote version, capturedAt.

Later quote corrections or new versions **do not** rewrite a sent snapshot.

## Guards

| Check | Behaviour |
| --- | --- |
| Expired quote | Block select + block send (`QUOTE_EXPIRED`) |
| Superseded / not latest | Block select + block send |
| Ownership | Request + quote must belong to authenticated user |
| Recipient | Resolved server-side from inbound sender or directory contact — no arbitrary To |
| Live send | Email verification required |
| After proceed sent | Selection locked; no casual re-select |

## Idempotency

Proceed send uses a **separate** claim/idempotency key from the original RFQ (`cc-proceed-{proceedId}`).

Repeat send after success returns current state (`alreadySent`).

## Related

- [COMMERCIAL_WORKFLOW.md](./COMMERCIAL_WORKFLOW.md)
- [EMAIL_DELIVERY.md](./EMAIL_DELIVERY.md)
- [DATABASE.md](./DATABASE.md)
