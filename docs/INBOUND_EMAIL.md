# Inbound commercial email (CargoConnect)

## Provider decision

**Resend is sufficient for inbound** — keep a single provider.

Resend currently supports:
- Receiving domains (custom MX or `.resend.app`)
- `email.received` webhooks
- Receiving API for full HTML/text/headers
- Attachment metadata + temporary download URLs
- Message IDs / threading headers via retrieved content

No second inbound provider was added.

## Architecture

```
Broker reply
  → Resend receiving domain
  → POST /api/webhooks/email/inbound (Svix signature)
  → Fetch full content (Receiving API)
  → Correlate (reply token → In-Reply-To)
  → Persist CommercialMessage + attachment metadata
  → Deterministic quote extraction (pre-proceed)
  → or proceed-confirmation classify/extract/compare (post-proceed — never auto-book)
  → SENT → RESPONSE_RECEIVED
  → or AWAITING_CONFIRMATION → CONFIRMATION_REVIEW_REQUIRED / TERMS_CHANGED / …
  → Request detail conversation UI
```

## Reply-To / correlation

When `EMAIL_INBOUND_ENABLED=true` and `EMAIL_INBOUND_DOMAIN` is set:

```
Reply-To: request+{replyToken}@{EMAIL_INBOUND_DOMAIN}
```

- `replyToken` is cryptographically random (`base64url`), stored on the commercial request
- Not a sequential DB id or user id
- Outbound messages also store a stable `internetMessageId` for `In-Reply-To` fallback
- Subject text alone never correlates

Requester name, company, email, and phone remain in the outbound body so brokers know who inquired.

## Webhook

| Item | Value |
| --- | --- |
| URL | `https://{APP_BASE_URL}/api/webhooks/email/inbound` |
| Event | `email.received` |
| Auth | Svix headers + `EMAIL_WEBHOOK_SECRET` / `RESEND_WEBHOOK_SECRET` |
| Idempotency | Unique `(provider, provider_message_id)` |

Unsigned / invalid signatures → `401`.

## Status rules

| Prior status | On correlated inbound |
| --- | --- |
| `SENT` | → `RESPONSE_RECEIVED` |
| `RESPONSE_RECEIVED` | stays; additional messages appended |
| `DELIVERY_SIMULATED` | **no** live response transition |
| `DRAFT` / `READY_TO_SEND` | correlated only if token matches; status unchanged |

## Attachments

- Metadata only in Postgres (filename, content type, size, provider attachment id)
- Allowlisted types (pdf/office/images/csv/txt); max 15MB
- No binary blob storage in DB for MVP
- No antivirus — document limitation for production hardening

## Quote extraction

1. Deterministic regex/heuristics (`extractQuoteDeterministic`)
2. Optional LLM layer reserved (not required for MVP when unset)

Original broker email is always preserved on `CommercialMessage`. Extracted fields are shown as **CargoConnect extracted**.

## Local development

Inbound webhooks need a public URL in real Resend flows.

Dev fixture (non-production only):

```bash
EMAIL_INBOUND_DEV_FIXTURES=true
```

```http
POST /api/webhooks/email/inbound/dev-fixture
{
  "toAddresses": ["request+{token}@reply.test.local"],
  "fromAddress": "broker@example.com",
  "subject": "Re: quote",
  "textBody": "We can offer USD 42/MT ..."
}
```

Production never enables this route (`NODE_ENV=production` → 404).

## Environment

```
EMAIL_INBOUND_ENABLED=true
EMAIL_INBOUND_PROVIDER=resend
EMAIL_INBOUND_DOMAIN=reply.your-domain.com
EMAIL_WEBHOOK_SECRET=whsec_...
EMAIL_API_KEY=re_...          # also used to fetch received content
EMAIL_INBOUND_DEV_FIXTURES=false
```

Never use `NEXT_PUBLIC_` for webhook secrets.

## Manual Resend setup

1. Add receiving domain (or use `.resend.app`) and configure MX
2. Create webhook → `email.received` → your `/api/webhooks/email/inbound`
3. Copy signing secret → `EMAIL_WEBHOOK_SECRET`
4. Set `EMAIL_INBOUND_DOMAIN` to that receiving domain
5. Run `npm run db:migrate` (applies `0002_inbound_email.sql`)
6. Send a live RFQ (`EMAIL_DELIVERY_MODE=live`) so status is `SENT`
7. Reply to the capture Reply-To address from a test inbox

## Known limitations

- No automatic forwarding of broker replies to the user yet
- Attachment bytes not durably stored (metadata + provider id only)
- No antivirus scanning
- LLM extraction optional / off by default
- Proceed-reply classification never auto-creates a booking — see [COMMERCIAL_CONFIRMATION.md](./COMMERCIAL_CONFIRMATION.md)
- Operational milestone phrases create **PENDING candidates only** — never auto-confirm

## Operational milestone candidates (post-handoff)

When a booking has an active `ShipmentExecution`, inbound broker/carrier text may
detect phrases such as:

- cargo loaded / loading completed
- vessel sailed / departed
- vessel arrived
- discharging completed / cargo discharged
- cargo delivered / delivery completed

These create `ShipmentMilestoneCandidate` rows (`PENDING`) with evidence referencing
the inbound message id. Users confirm or dismiss on the tracking page.

AIS corroboration/conflict notes may appear — they never auto-confirm.

See [SHIPMENT_COMPLETION.md](./SHIPMENT_COMPLETION.md).
