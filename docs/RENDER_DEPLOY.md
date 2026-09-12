# Deploy CargoConnect on Render (always-on live AIS)

Use a **paid always-on** Web Service (`starter` or higher).  
The free Render tier sleeps when idle and **drops the AISStream WebSocket**.

AISStream remains **development / prototype only** until commercial/public-display rights are confirmed.

## Why Render

| Need | Render starter |
| --- | --- |
| Long-lived Node process | Yes |
| AISStream WebSocket | Yes (while service is running) |
| GitHub auto-deploy | Yes |
| Env vars UI | Yes |
| In-memory vessel cache | Yes (single instance) |

Run **one instance** only. Multiple instances = split caches (no Redis yet).

## 1. Prerequisites

1. GitHub repo: https://github.com/mohamedGougam/CargoConnect  
2. AISStream API key from https://aisstream.io/ (GitHub login → Account → create key)  
3. Render account: https://render.com  

## 2. Create the service

### Option A — Blueprint (recommended)

1. Push `render.yaml` to `master` (already in this repo once committed).  
2. Render Dashboard → **New** → **Blueprint**  
3. Connect the `CargoConnect` GitHub repo  
4. Apply the blueprint  
5. When prompted for `AISSTREAM_API_KEY`, paste your key (never commit it)

### Option B — Manual Web Service

1. **New** → **Web Service**  
2. Connect `mohamedGougam/CargoConnect`  
3. Settings:

| Field | Value |
| --- | --- |
| Name | `cargo-connect` |
| Region | Frankfurt (or closest) |
| Branch | `master` |
| Runtime | Node |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Instance type | **Starter** (not Free) |
| Health check path | `/api/health` |

## 3. Environment variables

Set these in Render → Environment (or via Blueprint):

| Key | Value | Notes |
| --- | --- | --- |
| `NODE_VERSION` | `20` | Required for Next.js 16 |
| `NEXT_PUBLIC_MARITIME_DATA_MODE` | `composite` | Browser mode |
| `MARITIME_DATA_MODE` | `composite` | Server ingest mode |
| `AISSTREAM_ENABLED` | `true` | Master switch |
| `AISSTREAM_API_KEY` | *(your secret)* | **Secret** — never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_MAP_STYLE_URL` | `dark` | Basemap |
| `NEXT_PUBLIC_MARITIME_POLL_INTERVAL_MS` | `10000` | Client poll interval |
| `MARITIME_DIAGNOSTICS_ENABLED` | `true` | Enables `/api/maritime/diagnostics` |
| `AUTH_SECRET` | *(random ≥32 chars)* | Session cookie signing |
| `DATABASE_URL` | *(Render Postgres)* | Commercial users/requests |
| `EMAIL_DELIVERY_MODE` | `log` or `live` | Prefer `log` until domain verified |
| `EMAIL_API_KEY` | *(Resend secret)* | Only for `live` |
| `EMAIL_FROM_ADDRESS` | `requests@your-domain` | Verified domain |
| `EMAIL_FROM_NAME` | `CargoConnect` | From display name |
| `APP_BASE_URL` | `https://your-service.onrender.com` | Verification email links |
| `EMAIL_VERIFICATION_TOKEN_TTL_MINUTES` | `60` | Token expiry |
| `EMAIL_INBOUND_ENABLED` | `true` when ready | Capture broker replies |
| `EMAIL_INBOUND_DOMAIN` | `reply.your-domain.com` | Receiving domain |
| `EMAIL_WEBHOOK_SECRET` | `whsec_…` | Resend webhook signing secret |
| `DOCUMENT_STORAGE_PROVIDER` | `s3` | **Do not** use `local` on Render (ephemeral disk) |
| `DOCUMENT_STORAGE_BUCKET` | private bucket | Never public-read |
| `DOCUMENT_STORAGE_ENDPOINT` | R2/S3 endpoint | e.g. Cloudflare R2 |
| `DOCUMENT_STORAGE_REGION` | `auto` or AWS region | |
| `DOCUMENT_STORAGE_ACCESS_KEY` | *(secret)* | Never `NEXT_PUBLIC_` |
| `DOCUMENT_STORAGE_SECRET_KEY` | *(secret)* | Never `NEXT_PUBLIC_` |
| `DOCUMENT_STORAGE_FORCE_PATH_STYLE` | `true` for R2/MinIO | |
| `DOCUMENT_MAX_FILE_SIZE_MB` | `15` | Upload size cap |
| `MALWARE_SCAN_PROVIDER` | `noop` | **Demo only** — see DEMO_ACTIVATION |
| `MALWARE_SCAN_ALLOW_NOOP` | `true` | **Demo only** — remove before production |
| `RATE_LIMIT_PROVIDER` | `redis` | With Upstash REST credentials |
| `UPSTASH_REDIS_REST_URL` | *(secret)* | Never `NEXT_PUBLIC_` |
| `UPSTASH_REDIS_REST_TOKEN` | *(secret)* | Never `NEXT_PUBLIC_` |
| `SHIPMENT_OBSERVATION_JOB_SECRET` | *(≥16 char secret)* | Cron auth |
| `SHIPMENT_OBSERVATION_INTERVAL_SECONDS` | `300` | Watcher freshness window |

### Shipment observation cron (Render)

`render.yaml` defines cron service `cargo-connect-shipment-observation` on schedule `*/5 * * * *`.

Set on the **cron** service:

| Key | Value |
| --- | --- |
| `CRON_TARGET_URL` | `https://YOUR-SERVICE.onrender.com/api/internal/shipment-observation/run` |
| `SHIPMENT_OBSERVATION_JOB_SECRET` | same value as the web service |

Do **not** add an in-process infinite watcher loop inside the web service.

Validate from an operator machine (app must be up):

```bash
CRON_VALIDATE_BASE_URL=https://YOUR-SERVICE.onrender.com npm run cron:validate
```

After adding Postgres:

```bash
npm run db:migrate
npm run db:seed
```

(run from a machine/shell with `DATABASE_URL` set — not on every request).

Optional:

```text
AISSTREAM_BBOXES=[[[30.0,22.0],[41.5,37.0]]]
```

Default bbox ≈ Eastern Mediterranean (Greece / Aegean / Crete / W. Turkey / Cyprus approaches).

### Do not set

- `AISSTREAM_APIKEY` (typo — wrong name)
- `NEXT_PUBLIC_AISSTREAM_API_KEY` (leaks the key to browsers)
- `NEXT_PUBLIC_EMAIL_API_KEY` / any email secret with `NEXT_PUBLIC_`
- Unused Mapbox / external maritime URL vars from other projects

## 4. Deploy and verify

1. Wait for the first deploy to finish (build + start).  
2. Open:

```text
https://YOUR-SERVICE.onrender.com/
https://YOUR-SERVICE.onrender.com/api/health
https://YOUR-SERVICE.onrender.com/api/maritime/diagnostics
https://YOUR-SERVICE.onrender.com/api/maritime/vessels
```

### Expected results

| Endpoint | Healthy live prototype |
| --- | --- |
| `/api/health` | `{ "ok": true, ... }` |
| `/api/maritime/diagnostics` | `canConnectAis: true`, `connectionState: "connected"` (after a few seconds), `vesselsInCache` growing |
| `/api/maritime/vessels` | `fallback: false`, `count` > 0 after AIS messages arrive |
| Map badge | `Live AIS prototype · development feed` |

Give the feed **30–60 seconds** after boot to accumulate vessels.

### If you still see demo ships

| Symptom | Cause |
| --- | --- |
| `fallback: true`, `aisstream_not_configured` | Missing/wrong env vars → fix + redeploy |
| `fallback: false`, `count: 0` | Feed still connecting or bbox quiet → wait / check diagnostics |
| Badge still says demonstration | `NEXT_PUBLIC_*` not applied → redeploy after changing public env vars |
| Free plan | Service slept → upgrade to **Starter** |

## 5. After deploy checklist

- [ ] Plan is **Starter** (always-on), not Free  
- [ ] `AISSTREAM_API_KEY` set as a secret  
- [ ] `/api/health` returns 200  
- [ ] Diagnostics shows connected + vessels in cache  
- [ ] Map shows Eastern Med camera + live badge  
- [ ] Live vessels do **not** animate on demo routes  
- [ ] Rotate AISStream key if it was ever exposed in screenshots  
- [ ] Postgres migrated through `0012` (`npm run db:status`)  
- [ ] Observation cron secret set + cron job hitting `/api/internal/shipment-observation/run`  
- [ ] Demo malware bypass intentional (`noop` + `ALLOW_NOOP`) or real HTTP scanner configured  
- [ ] See [DEMO_ACTIVATION.md](./DEMO_ACTIVATION.md) for full demo checklist  

## 6. Cost note

Render **Starter** is paid (~$7/mo class). Free Web Services sleep and are **not** suitable for reliable live AIS.

## 7. Licensing reminder

AISStream on this deployment is still a **prototype / development feed**.  
Do not market it as commercially licensed global AIS until rights are confirmed in writing.
