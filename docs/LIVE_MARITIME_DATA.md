# Live maritime data (prototype)

**AISStream is for DEVELOPMENT / PROTOTYPE use only.**  
Commercial and public-display rights are **not confirmed**. Do not present this feed as commercially licensed or globally comprehensive.

## Architecture

```
AISStream (server WebSocket)
        ↓
AISStreamClient
        ↓
parse + normalize
        ↓
VesselStateStore (in-memory, MMSI-keyed)
        ↓
GET /api/maritime/vessels
        ↓
LiveAISMaritimeDataProvider / CompositeMaritimeDataProvider
        ↓
MaritimeMap (polled snapshots — not per AIS message)
```

Ports (static):

```
NGA World Port Index CSV + UN/LOCODE CSV
        ↓
npm run import:ports
        ↓
src/data/ports/catalog.eastern-med.json
        ↓
GET /api/maritime/ports
```

## Sample mode (default)

```bash
# .env.local
NEXT_PUBLIC_MARITIME_DATA_MODE=sample
MARITIME_DATA_MODE=sample
AISSTREAM_ENABLED=false
```

```bash
npm run dev
```

Badge: `Demonstration data · not live AIS`

No API key required. App starts even if AISStream is down.

## Live prototype mode

**Blocked without your key:** there is no `AISSTREAM_API_KEY` in the repo. You must create one.

1. Open [https://aisstream.io/](https://aisstream.io/) → sign in with GitHub → **Account** → create an API key (shown once).
2. Put this in **`.env.local`** (never commit):

```bash
NEXT_PUBLIC_MARITIME_DATA_MODE=composite
MARITIME_DATA_MODE=composite
AISSTREAM_ENABLED=true
AISSTREAM_API_KEY=paste_your_key_here
NEXT_PUBLIC_MAP_STYLE_URL=dark
NEXT_PUBLIC_MARITIME_POLL_INTERVAL_MS=10000
# Optional override (default already Eastern Med):
# AISSTREAM_BBOXES=[[[30.0,22.0],[41.5,37.0]]]
```

3. Check config (does not print the key):

```bash
npm run maritime:preflight
```

4. Restart `npm run dev`, then:

```bash
npm run maritime:status
# → GET http://localhost:3000/api/maritime/diagnostics
```

5. Open [http://localhost:3000](http://localhost:3000) — map should center on the Aegean; badge: `Live AIS prototype · development feed`.

### Default AIS bounding box

| Corner | Lat | Lon |
| --- | --- | --- |
| SW | 30.0 | 22.0 |
| NE | 41.5 | 37.0 |

**Covers:** mainland Greece, Aegean Sea, Piraeus / Attica, Thessaloniki approaches, Crete, western Turkey (incl. Izmir / approaches), Cyprus approaches, and Eastern Med corridors toward Egypt. **Not** global.

Badge: `Live AIS prototype · development feed`

### Live vs sample behaviour

| | Sample | Live / composite |
| --- | --- | --- |
| Vessels | Demo dataset | AIS cache only |
| Routes | Demo polylines | **None** (no invented routes) |
| Motion | Animated along demo routes | **Only** when new AIS positions arrive (poll) |
| Map camera | Wide demo view | Eastern Med |
| Ports | Sample ports | WPI + UN/LOCODE catalog |
| Badge | Demonstration data · not live AIS | Live AIS prototype · development feed |

Composite may **fall back entirely** to sample if the live API is unavailable — it does **not** merge sample fields into live MMSIs.

### Modes

| Mode | Vessels | Ports | Routes |
| --- | --- | --- | --- |
| `sample` | Demo dataset | Demo ports | Demo routes |
| `live` | AIS cache via API | Catalog via API | None (no invented routes) |
| `composite` | AIS (sample fallback on failure) | Catalog (sample fallback) | Sample only if vessels fell back |

## Port import

Fixtures for Eastern Med ship with the repo:

- `data/fixtures/ports/wpi-eastern-med.fixture.csv`
- `data/raw/unlocode-eastern-med.fixture.csv`

To rebuild the catalog:

```bash
npm run import:ports
```

To use a full NGA dump later, place `data/raw/UpdatedPub150.csv` (and optional `unlocode.csv`) and re-run the import. The script filters to the Eastern Med bbox.

**Disclaimer:** Not for navigation. Do not imply NGA endorsement.

## Environment variables

See `.env.example`. Critical rules:

- Never put `AISSTREAM_API_KEY` in `NEXT_PUBLIC_*`
- Never commit `.env.local`
- Default everything to sample / AIS disabled

## Freshness

| State | Age since last position |
| --- | --- |
| `live` | ≤ 15 minutes |
| `stale` | ≤ 2 hours |
| `very_stale` | > 2 hours (hidden from default snapshot after 6 hours) |

Metadata is attached on vessels (`meta.freshness`) for a future UI pass — no visual redesign in this phase.

## What AIS cannot provide

Do not invent from AIS: commercial available capacity, broker data, DWT/TEU as authoritative, detailed port handling, or contracted shipping lines.
