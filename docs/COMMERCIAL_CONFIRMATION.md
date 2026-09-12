# Commercial confirmation

## Principle

CargoConnect never creates a booking because a classifier thinks an email looks positive.

```
Proceed sent → broker replies → classify + extract + compare snapshot
→ user reviews → explicit acknowledgement → COMMERCIALLY_CONFIRMED → Booking
```

Original email remains the source of truth.

## Classification (deterministic)

| Result | Typical cues |
| --- | --- |
| `PROCEED_CONFIRMED` | confirmed / as per your request / booking reference |
| `TERMS_CHANGED` | proceed + however / final rate is / revised |
| `PROCEED_REJECTED` | unavailable / decline / cannot proceed |
| `MORE_INFORMATION_REQUIRED` | please provide / before we confirm |
| `GENERAL_REPLY` / `UNKNOWN` | everything else |

After extraction, **material diffs vs ProceedSnapshot** force `TERMS_CHANGED` even if wording sounded like a clean confirm.

## Comparison

`compareConfirmationToSnapshot` emits diffs with severity:

- `INFO` — additions (e.g. vessel name when none was selected)
- `MATERIAL_CHANGE` — laycan, exclusions, payment, quantity
- `CRITICAL_CHANGE` — rate, currency, route

Missing confirmation fields do **not** invent a change.

## User review

`/commercial/requests/[id]/confirmation`

- Proceed snapshot
- Extracted confirmation
- Diffs / warnings
- Original email
- Sender trust

Clean confirmation CTA: **Confirm Commercial Agreement** (two unchecked acknowledgements).

Changed terms: show proposed changes; booking only after explicit **Accept Changed Terms**
(checkboxes + CTA → immutable `AcceptedCommercialSnapshot`). See
[DOCUMENT_WORKFLOW.md](./DOCUMENT_WORKFLOW.md).

Rejection / more-info: no confirmation CTA.

## Statuses

`AWAITING_CONFIRMATION` → `CONFIRMATION_REVIEW_REQUIRED` | `TERMS_CHANGED` | `CONFIRMATION_REJECTED` | `MORE_INFORMATION_REQUIRED` | `CONFIRMATION_RECEIVED` → (user ack) → `COMMERCIALLY_CONFIRMED`

## Related

- [BOOKING_FOUNDATION.md](./BOOKING_FOUNDATION.md)
- [COMMERCIAL_WORKFLOW.md](./COMMERCIAL_WORKFLOW.md)
- [QUOTE_SELECTION.md](./QUOTE_SELECTION.md)
