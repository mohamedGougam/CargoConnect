# Email verification (CargoConnect)

## Behaviour

1. User signs up (account starts **unverified**: `email_verified_at = null`).
2. Server creates a cryptographically random token, stores **only SHA-256 hash**.
3. Verification email is sent via the existing email provider (`log` or `live`).
4. User may browse, search, draft, and mark requests `READY_TO_SEND` without verifying.
5. **Live** commercial send (`EMAIL_DELIVERY_MODE=live`) requires `email_verified_at`.
6. **Log** mode may simulate sends for unverified users (`DELIVERY_SIMULATED`).

## Schema

- `users.email_verified_at` (nullable timestamptz)
- `email_verification_tokens` — `token_hash`, `expires_at`, `used_at`, `user_id`

Migration: `drizzle/0001_email_verification.sql` (applied by `npm run db:migrate`).

## Token security

- Raw token: 32 bytes `base64url` (never stored, never logged)
- Stored: SHA-256 hex hash
- Single-use (`used_at`)
- TTL: `EMAIL_VERIFICATION_TOKEN_TTL_MINUTES` (default 60)
- Resend: invalidates prior active tokens; cooldown + max 5/hour
- Failure responses do not enumerate users

## Routes

| Route | Purpose |
| --- | --- |
| `GET /auth/verify-email?token=` | Consume token, show success/failure UI |
| `POST /api/auth/verify-email` | JSON consume `{ token }` |
| `POST /api/auth/resend-verification` | Authenticated resend |

Link base: `APP_BASE_URL` (fallback `http://localhost:3000`).

## Audit events

- `USER_EMAIL_VERIFICATION_SENT`
- `USER_EMAIL_VERIFIED`
- `USER_EMAIL_VERIFICATION_FAILED` (no raw token in metadata)

## Existing / unverified users

Production: leave `email_verified_at` null — they must verify via resend.

Development options:

1. Sign in → **Resend verification email** (log mode prints subject/to; open `/auth/verify-email?token=…` from a captured test link if you instrument one).
2. Manually set verified in SQL (dev only):

```sql
UPDATE users SET email_verified_at = NOW() WHERE email = 'you@example.com';
```

Do **not** ship a production bypass.

## Deploy checklist

1. Run migrations (`npm run db:migrate`)
2. Set `APP_BASE_URL` to the public HTTPS origin
3. Verified Resend domain + `EMAIL_FROM_ADDRESS`
4. Keep `EMAIL_DELIVERY_MODE=log` until ready; then `live`
5. Confirm verification links open the correct environment
