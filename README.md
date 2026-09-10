# CargoConnect

AI-first maritime cargo platform. This repository is a **greenfield** project — it does not import or depend on CargoConnect-Archive.

## First iteration

The landing experience is a full-screen interactive world map with:

- Vessel and port markers
- Subtle voyage route lines
- Lightweight hover previews
- Detail side panels (progressive disclosure)
- A premium **CargoConnect AI** assistant bar (UI only — no LLM connected yet)

Data is isolated behind a `MaritimeDataProvider` interface. **Sample mode is the default.** An optional **live AIS prototype** (AISStream, server-side only) is feature-flagged and must not be treated as commercially licensed.

## Why MapLibre GL JS

| Option                      | Decision                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **MapLibre GL JS** (chosen) | Open-source WebGL renderer, free basemap tiles, strong GeoJSON performance, no paid SDK required for this stage |
| Mapbox GL                   | Excellent, but commercial licensing for production traffic                                                      |
| Leaflet                     | Simpler markers; weaker for large vessel counts and smooth GPU animation                                        |
| Google Maps                 | Paid, heavier branding, less ideal for custom maritime symbology                                                |

**Default basemap:** built-in ESRI Dark Gray (`NEXT_PUBLIC_MAP_STYLE_URL=dark`) — free, no API key. Alternatives: `ocean` (ESRI World Ocean) or any MapLibre style URL.

**Workers:** MapLibre’s GeoJSON worker is copied to `public/` via `npm postinstall` so vessel/port/route overlays render correctly under Next.js.

## Stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **Tailwind CSS** v4
- **MapLibre GL JS**
- ESLint + Prettier + Vitest
- Env-based configuration (`.env.example`)

## Architecture

```
src/
  app/                  # Next.js routes / layout + /api/maritime/*
  components/           # Map, drawers, AI bar
  domain/models/        # Vessel, Port, Route types
  data/providers/       # sample | live | composite
  data/ports/           # Generated static port catalog
  server/maritime/      # AISStream ingest, normalize, vessel cache, ports
  hooks/                # Data + map interaction
  lib/                  # Config, formatting, geo utilities
```

### Data principle

UI components never import sample datasets or AISStream directly.

1. `MaritimeDataProvider` defines the contract
2. `getMaritimeDataProvider()` selects `sample` | `live` | `composite` via `NEXT_PUBLIC_MARITIME_DATA_MODE`
3. Live ingest stays on the server (`AISSTREAM_API_KEY` is never `NEXT_PUBLIC_*`)
4. The browser polls normalized snapshots — not every AIS message

See [docs/LIVE_MARITIME_DATA.md](docs/LIVE_MARITIME_DATA.md) and [docs/MARITIME_DATA_STRATEGY.md](docs/MARITIME_DATA_STRATEGY.md).

## Deploy (always-on live AIS)

**Recommended host:** [Render](https://render.com) **Starter** Web Service (not Free — Free sleeps and drops AIS).

Blueprint: [`render.yaml`](render.yaml)  
Step-by-step: [docs/RENDER_DEPLOY.md](docs/RENDER_DEPLOY.md)

Vercel is fine for **sample** demos only. Persistent AISStream needs a long-lived Node process.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Script                    | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `npm run dev`             | Development server                        |
| `npm run build`           | Production build                          |
| `npm run start`           | Serve production build                    |
| `npm run lint`            | ESLint                                    |
| `npm run test`            | Vitest unit tests                         |
| `npm run format`          | Prettier write                            |
| `npm run import:ports`    | Rebuild Eastern Med port catalog from CSV |
| `npm run maritime:status` | Print live ingest diagnostics             |

## Environment

See `.env.example`:

- `NEXT_PUBLIC_MARITIME_DATA_MODE` — `sample` (default) \| `live` \| `composite`
- `MARITIME_DATA_MODE` — server ingest mode (keep aligned when testing live)
- `AISSTREAM_ENABLED` / `AISSTREAM_API_KEY` — **server only**, prototype use only
- `NEXT_PUBLIC_MAP_STYLE_URL` — MapLibre style key or URL

## What works now

- Full-viewport maritime map
- Sample demo vessels/ports/routes
- Optional live AIS prototype (feature-flagged, server ingest + MMSI cache)
- Static port catalog pipeline (WPI + UN/LOCODE fixtures → JSON)
- Vessel hover + detail drawer; port hover + detail drawer
- AI assistant bar UI shell (no backend AI yet)
- Provenance badge (demo vs live prototype wording)

## Explicitly out of scope (this iteration)

Authentication, payments, booking, marketplace, LLM integration, Redis, paid AIS contracts, satellite AIS, historical tracks.

## Licensing warning (AISStream)

AISStream may be used for **development / prototype** only until commercial/public-display rights are confirmed in writing. Do not make it the unconditional production default.
