# CargoConnect Maritime Data Strategy

**Status:** Research & architecture only (no implementation)  
**Date:** 2026-08-29  
**Scope:** How to later power the landing map with real vessel, voyage, route, and port data  
**Out of scope for this document:** Auth, booking, payments, marketplace, LLM/AI wiring, production AIS cutover

---

## 1. Executive recommendation

**MVP live vessels (development / public demo prototype):**  
Use **AISStream** (`wss://stream.aisstream.io/v0/stream`) **server-side only** to ingest AIS into a normalized vessel state cache, then expose it through CargoConnect’s existing `MaritimeDataProvider` seam. Keep **`SampleMaritimeProvider` as the default fallback**.

**MVP ports (static, separate pipeline):**  
Build ports from **NGA World Port Index (Pub 150)** + **UNECE UN/LOCODE**, optionally enriching coordinates/features from **OpenStreetMap / OpenSeaMap** with ODbL attribution. Do **not** invent broker contacts, live berth availability, or commercial capacity.

**Commercial / production path:**  
Treat AISStream as a **prototype feed**, not a guaranteed commercial license. Before charging users or marketing “live AIS,” obtain **written permission** from AISStream *or* migrate to a **paid self-serve API** (strong candidates: **VesselFinder LiveData / area feed**, **Datalastic**) and later enterprise (**Kpler / MarineTraffic**, **Spire Maritime** successor under Kpler).

**Do not** connect any third-party AIS WebSocket from the browser. AISStream explicitly forbids direct browser connections; licensing and key safety also require a backend.

---

## 2. CargoConnect data requirements

### Vessels (landing map + detail drawer)

| Need | Priority | Typical source |
| --- | --- | --- |
| Name, type, MMSI, IMO, flag | High | AIS static (type 5) + metadata; flag often derived from MMSI MID |
| Lat/lon, SOG, COG/heading, nav status | High | AIS dynamic (types 1–3, 18, 19, …) |
| Destination, ETA, draught | High | AIS static/voyage (type 5); ETA often unreliable |
| Origin / departure port | Medium | **Not** raw AIS; voyage enrichment / last port APIs |
| Length, beam | Medium | AIS dimensions A+B / C+D |
| DWT / TEU / commercial capacity | Low–Medium | Master databases (paid), **not** AIS |
| Cargo category / capability marketing claims | Later | Commercial datasets — **never invent from AIS** |

### Ports

| Need | Priority | Typical source |
| --- | --- | --- |
| Name, country, coordinates | High | WPI + UN/LOCODE |
| UN/LOCODE | High | UNECE UN/LOCODE |
| Port / harbor type, depths | Medium | WPI |
| Terminal / cargo facilities (coarse) | Medium | WPI Yes/No/Unknown facility flags |
| Equipment, lines, contacts | Low | Port authority / commercial — sparse in open data |
| Live vessel density at port | Later | Derived from AIS near port, not WPI |

**First priority for product:** vessel positions + core port identity/location.

---

## 3. AIS fundamentals relevant to the product

### 3.1 One message ≠ one complete vessel card

AIS is a **message stream**, not a vessel REST object.

| Message family | Examples | What you get |
| --- | --- | --- |
| **Dynamic / position** | Type 1–3 `PositionReport`, Class B 18/19, long-range 27 | MMSI, lat/lon, SOG, COG, heading, nav status, timestamp |
| **Static & voyage** | Type 5 `ShipStaticData` | Name, callsign, IMO, ship type code, dimensions, draught, destination string, ETA components |
| **Class B static** | Type 24 `StaticDataReport` | Partial name/callsign/dimensions for Class B |
| **Other** | AtoN, base station, safety, binary | Usually ignore for cargo landing MVP |

**Implication:** CargoConnect must maintain a **vessel state store keyed by MMSI**, merging:

1. Latest position report → position, speed, course, heading, navStatus, `sourceTimestamp`
2. Latest static/voyage report → name, IMO, type, destinationRaw, eta, draught, dimensions
3. Optional later enrichment → flag lookup, destination→port match, master DWT/TEU

Static messages arrive **far less often** than positions. UI must tolerate “position known, name unknown yet.”

### 3.2 What AISStream delivers for that model

Official docs: [aisstream.io/documentation](https://aisstream.io/documentation)

- WebSocket-only; subscribe with `APIKey` + required `BoundingBoxes` (+ optional MMSI / message-type filters)
- Envelope: `MessageType`, `MetaData` (often MMSI, ShipName, lat/lon), typed `Message`
- Relevant types for MVP: **`PositionReport`**, **`ShipStaticData`**, Class B position/static as secondary
- `ShipStaticData` includes: Name, CallSign, ImoNumber, Type, Dimension (A/B/C/D), Destination, Eta (Month/Day/Hour/Minute), MaximumStaticDraught
- MetaData often carries a cached ShipName even on position messages — useful but still not a substitute for proper state merge

### 3.3 What CargoConnect must **not** invent from AIS

Leave empty / “Not available” unless a verified non-AIS source provides it:

- Available commercial freight capacity / open tonnage for booking
- Actual cargo on board / broker offers
- Detailed port handling rates, crane lists, shipping-line schedules
- “True” commercial route products (AIS tracks ≠ contracted services)
- Owner/operator/P&I as authoritative commercial facts (needs licensed master data)

---

## 4. Provider comparison (live / near-live AIS)

Pricing is quoted **only** where publicly documented. “Contact sales” means **no public price asserted**.

| Provider | Type | Protocol | Free access? | Coverage | Public landing map? | Maturity | Verdict for CargoConnect |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **AISStream** | Community / free stream | WebSocket | **Yes** — free API key ([docs](https://aisstream.io/documentation)) | Claims global terrestrial network; no SLA | **Unclear** — no formal ToS; open questions on commercial/public display ([issue #16](https://github.com/aisstream/aisstream/issues/16), [#24](https://github.com/aisstream/aisstream/issues/24)) | Active docs; no SLA; ≤3 connections/account | **Best prototype feed**; gate commercial use |
| **AISHub** | Contribute-to-access | HTTP poll (~1/min) + NMEA | Free **only if** you contribute a qualifying AIS station feed ([join](https://www.aishub.net/join-us)) | Network of contributor stations | Contributor terms; not a drop-in SaaS | Mature community | Poor fit without owning receivers |
| **VesselFinder API** | Paid commercial | REST (+ LiveData subscription) | No free tier; credits from **10k / 330 EUR** ([docs](https://api.vesselfinder.com/docs/)) | Terrestrial + sat (sat = 10 credits) | Terms restrict redistribution / competing tracking; external display only if plan Order allows ([terms](https://www.vesselfinder.com/terms) §7) | Mature | Strong **paid MVP** candidate (LiveData area) |
| **Datalastic** | Paid commercial | REST credits | No free tier; **14-day paid trial**; Starter **199 EUR/mo** / 20k credits ([pricing](https://datalastic.com/pricing/)) | Live AIS + ports + history (per docs) | Commercial API — follow their license/ToS | Self-serve | Strong **paid MVP** alternative |
| **MarineTraffic / Kpler AIS** | Enterprise | REST / GraphQL / feeds | No public self-serve API pricing; sales-led ([Kpler MT enterprise](https://www.kpler.com/demos/request-marinetraffic-enterprise-plan)) | Very large network | Under enterprise contract | Industry leader | Stage 3–4 production |
| **FleetMon** | Legacy | — | N/A | Merged into MarineTraffic / Kpler; API retired | N/A | Sunset | **Do not integrate** |
| **Spire Maritime** | Enterprise (Kpler migration noted by aggregators) | GraphQL / TCP AIS | Contact sales; no public list ([Spire Maritime](https://spire.com/maritime/)) | Satellite + terrestrial | Contractual | High | Stage 3–4 / ocean gaps |
| **BarentsWatch AIS** | Government open data | REST + auth (OpenID) | Open under **NLOD** ([BarentsWatch](https://www.barentswatch.no/en/articles/open-data-via-barentswatch/)) | **Norwegian waters** (+ limitations: e.g. no small fishing/leisure in historic docs) | Yes under NLOD + attribution rules | Official | Excellent **regional** open supplement, not global MVP alone |
| **Danish AIS** | Government | Historical ZIP/CSV free; live stream is **paid subscription** ([DMA / SFS](https://www.dma.dk/safety-at-sea/navigational-information/ais-data)) | Historical free; live not free | Danish waters | Follow PSI / local terms | Official | History / regional, not global live MVP |

### AISStream deep dive (required)

| Topic | Finding |
| --- | --- |
| Still operates? | **Yes** — live site + current developer documentation (verified 2026-08-29) |
| Official docs | https://aisstream.io/documentation |
| WebSocket | `wss://stream.aisstream.io/v0/stream` |
| Free tier | Single free tier: register (GitHub), create API key; no published per-message fee |
| Limits | 3 subscribed connections/account; 3 open connections/IP; subscribe within 3s; subscription updates ≤1/s; MMSI filter ≤200; slow consumers may drop messages; compression recommended (bandwidth limits for uncompressed from Sep 2026) |
| Bounding boxes | **Required** |
| Message types | Full ITU-R M.1371-style set including PositionReport + ShipStaticData |
| Enough for UI? | **Position + MMSI + (often) name/type/destination/ETA** if you merge PositionReport + ShipStaticData into state |
| Browser | **Not permitted** — server proxy only |
| SLA | **None** — no uptime/delivery guarantee; no durable replay |
| Commercial / public map | **Unresolved in writing** — community questions unanswered as of research date. Treat as **prototype / internal / gated demo** until clarified |

---

## 5. Port-data comparison

| Source | What you get | Live? | License posture | Fit |
| --- | --- | --- | --- | --- |
| **NGA World Port Index (Pub 150)** | ~3.8k major ports: coords, harbor size/type, depths, facility Yes/No/Unknown, services | Static; updated ~monthly | **US Government work** — generally treated as public domain; do **not** imply NGA endorsement; **not for navigation** ([msi.nga.mil/Publications/WPI](https://msi.nga.mil/Publications/WPI)) | **Primary** port physical dataset |
| **UNECE UN/LOCODE** | Location codes, names, countries, often weak/missing coords | Static; periodic releases | Freely redistributable UNECE codelist (community mirrors often PDDL); confirm edition license on [UNECE download](https://unece.org/trade/cefact/UNLOCODE-Download) | **Primary** identity / join key |
| **OpenStreetMap / OpenSeaMap** | Harbours, berths, piers, some amenities | Community-updated | **ODbL** — attribution + share-alike for DB derivatives ([OSMF attribution](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)) | Optional enrich; keep separable from WPI |
| **Port authority open data** | Local terminals, drafts, contacts | Varies | Per portal | Selective later enrichment |
| **Commercial port APIs** (e.g. Datalastic Port Finder) | Convenience + extras | API | Paid ToS | Optional when already on paid AIS vendor |

**Reality check:** Open datasets give **identity, geography, and coarse facilities**. They do **not** reliably provide broker contacts, live berth booking, or shipping-line commercial schedules.

---

## 6. Licensing / commercial considerations

1. **“Publicly accessible” ≠ “free to republish commercially.”**  
2. **AISStream:** Attractive technically; **missing formal public license/ToS** for commercial display. Open GitHub issues ask exactly about commercial apps and public aggregate display — **unanswered**.  
   - **Policy for CargoConnect:** Use for **dev + explicitly labeled prototype demos** only until written approval **or** replace with a licensed commercial feed.  
3. **VesselFinder:** Paid API allowed for Permitted Purpose under Order; **default ToS prohibit** resale/redistribution and building a **competing vessel-tracking service**; external display requires plan permission + attribution rules (§7.4–7.5). Negotiate display rights before a public live map.  
4. **Datalastic:** Commercial product; follow published terms (not summarized here as a free open license).  
5. **Kpler / MarineTraffic / Spire:** Contractual enterprise licenses — safest for large-scale public products once budget exists.  
6. **AISHub:** Requires **your own** AIS contribution; scraped/public feeds prohibited as contribution sources.  
7. **WPI:** Suitable for commercial products with **no-navigation / no-endorsement** disclaimers.  
8. **UN/LOCODE:** Suitable for commercial coding of locations.  
9. **OSM/OpenSeaMap:** Commercial OK with **ODbL attribution** (and share-alike if you redistribute a derivative database).  
10. **BarentsWatch:** NLOD — commercial reuse generally allowed under Norwegian open-data terms; **regional only**.

**Landing map principle:** Always show data provenance (e.g. “Live AIS via … · Ports from WPI/UNLOCODE · Not for navigation”). Keep the existing demo badge pattern until live is contractually cleared.

---

## 7. Recommended MVP data stack

| Layer | Choice | Role |
| --- | --- | --- |
| Live vessels (prototype) | **AISStream** (server ingest) | Positions + static/voyage merge for a **bounded region** (e.g. Med / N. Europe bbox matching the demo map) |
| Ports | **WPI + UN/LOCODE** (batch import) | Static port layer independent of AIS |
| Enrichment (optional later) | OSM harbours | Only if attribution + join quality justified |
| Fallback | **`SampleMaritimeProvider`** | Default when no key / ingest down / license not cleared |
| Routes | Keep **demo routes** or derive simple great-circle / historical polylines later — **not** from inventing commercial services |
| Commercial claims | **None** | No available capacity / booking from AIS |

**Why this stack:** Lowest cost and effort to prove “real ships move on our map,” fits Next.js server adapters, preserves UI via `MaritimeDataProvider`, and has a clear paid upgrade (VesselFinder LiveData or Datalastic) when licensing or SLA becomes the blocker.

---

## 8. Proposed ingestion architecture

Fits the existing app: client hooks call `getMaritimeDataProvider()`; map never talks to AIS vendors.

```
AISStream (WSS)          WPI CSV + UN/LOCODE
        │                         │
        ▼                         ▼
┌───────────────────┐   ┌─────────────────────┐
│ AIS ingest worker │   │ Port import (batch) │
│ (Node / Next srv) │   │                     │
└─────────┬─────────┘   └──────────┬──────────┘
          │                        │
          ▼                        ▼
   Normalize adapters         Normalize → Port[]
          │
          ▼
   Vessel state cache (MMSI)
   in-memory Map (MVP)
          │
          ▼
   CargoConnect API
   GET /api/maritime/vessels
   GET /api/maritime/ports
          │
          ▼
   LiveAISMaritimeDataProvider
   implements MaritimeDataProvider
          │
          ▼
   useMaritimeData → Map UI
```

**MVP mechanics (lightweight):**

- Long-lived **server process** (Next.js instrumentation / separate `scripts/ais-ingest.ts` / small Node service) owns the AISStream socket  
- In-memory `Map<mmsi, VesselState>` with last position + last static + freshness  
- HTTP poll from `LiveAISMaritimeDataProvider.getVessels()` (e.g. every 5–15s) **or** SSE later — **do not** push AIS frames to the browser  
- Redis only when multiple Node instances or persistence across deploys is required  
- Env: `AISSTREAM_API_KEY` server-only; never `NEXT_PUBLIC_*`

**Explicit non-goals for first live slice:** Redis, Kafka, historical DB, satellite AIS, browser WebSockets to vendors.

---

## 9. Normalized vessel model (proposed — do not break UI yet)

Current `Vessel` (`src/domain/models/vessel.ts`) is UI-shaped and already close. Proposed evolution (additive fields preferred):

```ts
// Proposed conceptual model — not implemented in this iteration

identity: {
  id: string;            // prefer `mmsi:${mmsi}` or stable internal UUID
  mmsi: string;
  imo?: string;
  name?: string;         // may be missing until type 5
  callsign?: string;
  flag?: string;         // MID lookup, not always AIS field
}

classification: {
  aisShipType?: number;          // raw AIS type code
  normalizedVesselType?: VesselType | "other" | "unknown";
  cargoCategory?: string;        // coarse mapping only; omit if unknown
}

position: {
  latitude: number;
  longitude: number;
  speedOverGround?: number;
  courseOverGround?: number;
  heading?: number;
  navStatus?: string | number;
  timestamp: string;             // ISO of last position
}

voyage: {
  destinationRaw?: string;
  destinationNormalized?: string;  // matched port id/name if confident
  destinationPortId?: string;
  originPortId?: string;           // usually NOT from AIS
  eta?: string;                    // ISO if parseable; else omit
  draught?: number;
}

dimensions: {
  lengthMeters?: number;  // A+B
  beamMeters?: number;    // C+D
}

metadata: {
  source: "aisstream" | "sample" | "vesselfinder" | string;
  sourceTimestamp: string;
  freshnessSeconds: number;
  dataQuality: "live" | "stale" | "partial" | "demo";
}
```

**UI compatibility:** Keep mapping into today’s `Vessel` for drawers (`name`, `type`, `position`, `eta`, …). Extend types only when live provider lands. Make `name` / `type` / `cargoCategory` optional or provide safe unknowns so partial AIS vessels do not crash UI.

**Port model:** Current `Port` already has `unlocode`, specs, capabilities, contacts. Populate from WPI/UNLOCODE; leave `contacts` / `shippingLines` empty unless verified.

---

## 10. Data-quality rules (MVP)

| Issue | MVP rule |
| --- | --- |
| Stale positions | Mark `stale` if `now - sourceTimestamp > 15–30 min` (tunable by region); grey/dim or hide after e.g. **2–6 h** without update |
| Missing names | Show MMSI as fallback label; never invent a ship name |
| Malformed destination | Keep `destinationRaw`; only set `destinationPortId` on high-confidence match (exact UN/LOCODE / curated alias); else omit normalized fields |
| Bad ETA | Drop sentinel ETAs (month=0, etc.); omit rather than guess year |
| Duplicates | Last-write-wins per MMSI + message class; ignore older timestamps |
| MMSI oddities | Validate 9-digit; isolate shore/AtoN ranges from “cargo vessel” layers |
| Spoofing / jumps | Optional: discard impossible jumps (e.g. >80 kn sustained) for MVP display |
| Static rarer than dynamic | Partial vessels OK; UI already supports empty fields |
| Out of coverage | Remove or mark disappeared when stale threshold exceeded — do not freeze forever as “live” |
| Missing commercial fields | Empty / “Not available” — **never fabricate DWT, TEU, or available capacity** |

**Product principle:** Unavailable or unreliable → empty. Prefer honesty over a dense fake inspector.

---

## 11. Scaling strategy (cost path)

| Stage | Goal | Data strategy | Cost posture |
| --- | --- | --- | --- |
| **1 — Development / demo** | Prove UX with real motion in one bbox | AISStream server ingest + WPI/UNLOCODE ports + sample fallback | **$0** AIS if ToS allows prototype; ports free |
| **2 — Early MVP users** | Public landing with clear live badge | **Licensed** paid area feed (VesselFinder **LiveData** or Datalastic area/traffic) **or** written AISStream approval | VesselFinder credits from **330 EUR / 10k** ([docs](https://api.vesselfinder.com/docs/)); Datalastic Starter **199 EUR/mo** ([pricing](https://datalastic.com/pricing/)); negotiate **display rights** |
| **3 — Production / regional scale** | Multi-region, higher uptime, enrichment | Commercial API + optional BarentsWatch for NO EEZ; Redis/stateful ingest; master data for DWT/TEU | Mid-tier commercial contracts; still prefer self-serve until enterprise needed |
| **4 — Broader / global** | Ocean gaps, SLA, history, voyage intelligence | Kpler/MarineTraffic and/or Spire-class satellite+terrestrial under enterprise agreement | **Contact sales** — no public prices asserted |

Do not invent enterprise quotes. Obtain written quotes when Stage 3–4 starts.

---

## 12. Risks and limitations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| AISStream license ambiguity | Legal/product risk on public commercial map | Prototype-only; escalate written approval; paid backup ready |
| No SLA / dropped messages | Gaps on map | Reconnect + backoff; sample fallback; freshness rules |
| Terrestrial coastal bias | Empty oceans | Expect gaps; satellite only via paid Stage 3–4 |
| Destination/ETA garbage | Misleading drawer | Raw + omit bad parses; never over-normalize |
| Competing-product clauses (VesselFinder et al.) | Contract block | Negotiate display; position CargoConnect as logistics UX not raw AIS reseller |
| Over-claiming cargo capacity | Trust damage | Keep `VesselCargoInfo` empty from AIS |
| Multi-instance in-memory cache | Split brain | Single ingest worker or Redis before horizontal scale |
| OSM share-alike | Compliance burden | Prefer WPI-first; isolate OSM-derived tables |

---

## 13. Recommended next implementation step

**Status (2026-08-29):** First real-data foundation implemented behind feature flags. See [LIVE_MARITIME_DATA.md](./LIVE_MARITIME_DATA.md).

AISStream remains **prototype-only**. Do not make it the production default until licensing is confirmed.

**After written licensing approval (or paid provider selection):**

1. Enable `composite` / `live` in controlled environments only.  
2. Expand bbox / catalog coverage.  
3. Add Redis only if multi-instance persistence is required.  
4. Do not connect the AI assistant until data provenance is stable.

---

## 14. Source links / references

### AIS / vessel providers
- AISStream docs: https://aisstream.io/documentation  
- AISStream home: https://aisstream.io/  
- AISStream commercial-use question: https://github.com/aisstream/aisstream/issues/16  
- AISStream public display question: https://github.com/aisstream/aisstream/issues/24  
- AIS message models: https://github.com/aisstream/ais-message-models  
- AISHub join / terms: https://www.aishub.net/join-us  
- AISHub API: https://www.aishub.net/api  
- VesselFinder API docs: https://api.vesselfinder.com/docs/  
- VesselFinder terms: https://www.vesselfinder.com/terms  
- Datalastic pricing: https://datalastic.com/pricing/  
- MarineTraffic API access (support): https://support.marinetraffic.com/en/articles/9552798-how-to-access-and-review-your-api-services  
- Kpler MarineTraffic enterprise request: https://www.kpler.com/demos/request-marinetraffic-enterprise-plan  
- Spire Maritime: https://spire.com/maritime/  
- BarentsWatch open data: https://www.barentswatch.no/en/articles/open-data-via-barentswatch/  
- Danish AIS overview: https://www.dma.dk/safety-at-sea/navigational-information/ais-data  

### Ports / static
- NGA World Port Index: https://msi.nga.mil/Publications/WPI  
- UNECE UN/LOCODE download: https://unece.org/trade/cefact/UNLOCODE-Download  
- OSM attribution guidelines: https://osmfoundation.org/wiki/Licence/Attribution_Guidelines  
- ODbL summary: https://opendatacommons.org/licenses/odbl/summary/  

### CargoConnect codebase anchors
- `src/data/providers/types.ts` — `MaritimeDataProvider`  
- `src/data/providers/sample/SampleMaritimeProvider.ts`  
- `src/domain/models/vessel.ts`, `src/domain/models/port.ts`  
- `src/hooks/useMaritimeData.ts`

---

## Appendix A — Recommended provider abstraction (not implemented)

Prefer **composition of sources** under one UI-facing provider:

```
MaritimeDataProvider                 ← UI depends only on this
├── SampleMaritimeDataProvider       ← current default
├── LiveAISMaritimeDataProvider      ← reads CargoConnect API / cache
└── CompositeMaritimeDataProvider    ← vessels from AIS, ports from static, routes from demo/derived
         ▲
         │ assembles
AISIngestAdapter | PortCatalogProvider | (optional) VesselMasterDataProvider
```

**Cleaner than** forcing ports through an “AIS provider.” Keep `MaritimeDataProvider` as the **facade** the map already uses; add focused ingest adapters underneath. Avoid browser-side vendor SDKs.

---

## Appendix B — Implementation complexity (estimate)

| Work item | Effort |
| --- | --- |
| AISStream ingest + MMSI cache + reconnect | **M** (2–4 days) |
| Normalize → existing `Vessel` + API route | **S–M** (1–2 days) |
| WPI + UN/LOCODE port import + mapping | **M** (2–3 days) |
| Composite provider + feature flag + fallback | **S** (0.5–1 day) |
| Licensing outreach / paid vendor eval | **Parallel** (calendar time) |
| Redis / multi-instance / sat AIS | **Later** |

Overall first live prototype: roughly **one focused engineering week**, assuming one geographic bbox and no master-data enrichment.
