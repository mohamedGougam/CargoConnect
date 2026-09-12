# Email delivery (CargoConnect)

## Provider

**Resend** — simple Node/Next.js API, domain verification, transactional focus.
Abstracted behind `EmailDeliveryProvider` so another provider can replace it later.

Implementation:
- `LogEmailDeliveryProvider` (default)
- `ResendEmailDeliveryProvider` (`EMAIL_DELIVERY_MODE=live`)

## Modes

| Mode | Env | Behaviour |
| --- | --- | --- |
| `log` (default) | `EMAIL_DELIVERY_MODE=log` | Validates + records message; **no external API**. Status → `DELIVERY_SIMULATED` |
| `live` | `EMAIL_DELIVERY_MODE=live` | Calls Resend. Status → `SENT` on success |

Automated tests **always** use `log` and never email real brokers.

## Environment

```
EMAIL_PROVIDER=resend
EMAIL_DELIVERY_MODE=log
EMAIL_API_KEY=                 # server only — never NEXT_PUBLIC_
EMAIL_FROM_ADDRESS=requests@your-verified-domain
EMAIL_FROM_NAME=CargoConnect
EMAIL_REPLY_TO_OVERRIDE=       # ignored when inbound capture Reply-To is enabled
```

When inbound capture is enabled (`EMAIL_INBOUND_ENABLED=true`), Reply-To becomes
`request+{token}@{EMAIL_INBOUND_DOMAIN}` instead of the user email. See [INBOUND_EMAIL.md](./INBOUND_EMAIL.md).

## Domain verification (manual)

1. Create a Resend account: https://resend.com  
2. Add and verify your sending domain  
3. Create an API key  
4. Set `EMAIL_FROM_ADDRESS` to an address on that domain  
5. Set `EMAIL_DELIVERY_MODE=live` only after verification  

## Send behaviour

### RFQ / reservation request

- From: `CargoConnect <EMAIL_FROM_ADDRESS>` (platform sender — not the user)
- Reply-To: inbound capture address when enabled, else account email
- To: email resolved **server-side** from `CommercialContact` directory by contact ID
- User must explicitly confirm Send
- Idempotent: `READY_TO_SEND|SEND_FAILED` → `SENDING` → `SENT|DELIVERY_SIMULATED`
- Message kind: `RFQ` or `RESERVATION_REQUEST`
- Already sent → returns current status, no duplicate outbound email

### Request to Proceed

Separate commercial message after quote selection:

- To: resolved from **selected quote’s inbound reply sender** when present, else directory contact
- No arbitrary recipient injection from the client
- Idempotency key: `cc-proceed-{proceedId}` (independent of RFQ)
- Claim path: `READY_TO_SEND|SEND_FAILED` → `SENDING` → `SENT|DELIVERY_SIMULATED` on the proceed record
- Request status: `PROCEED_SENDING` → `AWAITING_CONFIRMATION` (or `PROCEED_SEND_FAILED`)
- Message kind: `PROCEED_REQUEST`
- Server rechecks quote expiry + latest/superseded version immediately before send
- Immutable proceed snapshot stored at prepare/send — see [QUOTE_SELECTION.md](./QUOTE_SELECTION.md)

## Status lifecycle

### RFQ

```
DRAFT → READY_TO_SEND → SENDING → SENT
                              ↘ SEND_FAILED → (retry) → SENDING → …
log mode: SENDING → DELIVERY_SIMULATED
```

Then inbound replies may move the request to `RESPONSE_RECEIVED`.

### Proceed

```
QUOTE_SELECTED → PROCEED_READY_TO_SEND → PROCEED_SENDING → AWAITING_CONFIRMATION
                                           ↘ PROCEED_SEND_FAILED → (retry) …
```

Reserved: `CLOSED`  
Not yet: booked / paid.

## Security

- Auth required
- Ownership check
- Directory-only or inbound-sender recipients (no arbitrary To)
- Rate limit ~20 RFQ sends/user/hour; separate proceed rate limit
- Subject/body length caps
- No API keys in browser
- **Live mode** requires `users.email_verified_at` (see below)

## Email verification gate

| Mode | Unverified user may send? | Result |
| --- | --- | --- |
| `log` | Yes | `DELIVERY_SIMULATED` — no Resend call |
| `live` | **No** | `EMAIL_VERIFICATION_REQUIRED` — request stays `READY_TO_SEND` |

Verification flow: signup → hashed single-use token email → `/auth/verify-email?token=…` → `email_verified_at` set.

Env:

```
APP_BASE_URL=https://your-deployed-host
EMAIL_VERIFICATION_TOKEN_TTL_MINUTES=60
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=60
```

See `docs/EMAIL_VERIFICATION.md` for token security, resend rules, and migration notes.
