# Commercial conversion workflow (MVP)

## End-to-end

Free map search → drawer CTA → auth (context preserved) → Price / Reservation form →
`READY_TO_SEND` → explicit **Send Request** (RFQ) → transactional email →
`RESPONSE_RECEIVED` → conversation + extracted quotes → **Compare Quotes** →
**Select This Quote** → **Request to Proceed** → `AWAITING_CONFIRMATION` →
broker reply → confirmation review → explicit **Confirm Commercial Agreement** →
`COMMERCIALLY_CONFIRMED` + Booking record.

Payment, escrow, and shipment execution are **out of scope**.

## Statuses

### RFQ (initial commercial outreach)

`DRAFT` → `READY_TO_SEND` → `SENDING` → `SENT`  
Failures: `SEND_FAILED` (retryable)  
Dev log mode: `DELIVERY_SIMULATED` (does **not** auto-promote to `RESPONSE_RECEIVED`)

Then: `RESPONSE_RECEIVED`

### Selection / proceed

`QUOTE_SELECTED` → `PROCEED_READY_TO_SEND` → `PROCEED_SENDING` → `AWAITING_CONFIRMATION`  
Failures: `PROCEED_SEND_FAILED` (retryable)

### Confirmation / booking

`AWAITING_CONFIRMATION` → `CONFIRMATION_REVIEW_REQUIRED` | `TERMS_CHANGED` | `CONFIRMATION_REJECTED` | `MORE_INFORMATION_REQUIRED` | `CONFIRMATION_RECEIVED`  
→ (explicit user ack of clean confirmation only) → `COMMERCIALLY_CONFIRMED`

Do **not** jump from inbound reply to `COMMERCIALLY_CONFIRMED`.

Reserved: `CLOSED`

## Honesty

- No fabricated freight rates
- No “booking confirmed” from RFQ or proceed send alone
- No automatic booking from email classification
- Changed terms never create a booking without a dedicated approval path
- Extracted fields are labelled; original email is source of truth

## Related docs

- [QUOTE_SELECTION.md](./QUOTE_SELECTION.md)
- [COMMERCIAL_CONFIRMATION.md](./COMMERCIAL_CONFIRMATION.md)
- [BOOKING_FOUNDATION.md](./BOOKING_FOUNDATION.md)
- [EMAIL_DELIVERY.md](./EMAIL_DELIVERY.md)
- [INBOUND_EMAIL.md](./INBOUND_EMAIL.md)
- [QUOTE_COMPARISON.md](./QUOTE_COMPARISON.md)
- [DATABASE.md](./DATABASE.md)
- [RENDER_DEPLOY.md](./RENDER_DEPLOY.md)

## Auth

bcrypt password hashes + signed HTTP-only `cc_session` cookie (`jose`).  
Users live in Postgres when `DATABASE_URL` is set (re-register after fresh DB).
