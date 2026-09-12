# Global Maritime Data (Development / Demo)

**Status:** Viewport-driven global exploration on AISStream (development feed)  
**Does NOT mean:** complete worldwide AIS, licensed production coverage, or commercial marketplace coverage

---

## 1. Architecture

```
Map viewport (debounced)
        ↓
GET /api/maritime/vessels?bbox=…&zoom=…
        ↓
ViewportSubscriptionManager (seed + viewport boxes)
        ↓
AISStreamClient.updateSubscription()  ← same WebSocket (swap-and-replace)
        ↓
InMemoryVesselStateStore (MMSI, bounded, TTL prune)
        ↓
Normalized Vessel[] → MapLibre (clustered at low zoom)
```

Browser **never** opens AISStream. API keys stay server-side.

`MaritimeDataProvider` remains the only UI data seam (`sample` | `live` | `composite`). Future licensed providers plug in without rewriting the map or commercial workflow.

---

## 2. Previous limitation

Demo V1 defaulted AIS ingest to **Eastern Mediterranean** only:

`SW [30, 22] → NE [41.5, 37]`

Ports catalog was also Eastern-Med–scoped. That is no longer a hard product limit.

---

## 3. Viewport subscription strategy

- **Seed regions** (always warm): Eastern Med, North Sea, Mediterranean — keeps Rotterdam→Alexandria demo fed.
- **Viewport interest**: each vessels API call with a bbox registers interest; manager **debounces (~750ms)**, **quantizes** tiny pans, pads bounds, splits antimeridian, tiles oversized spans.
- **World / continental zoom**: subscription is **clipped** to a center tile — we do **not** subscribe to the entire globe on one box.
- Cap on concurrent AIS boxes (~12).
- AISStream supports **resending** `BoundingBoxes` on the open socket (replace, not merge).

---

## 4. AISStream limitations

- Development / demo provider only — **licensing for public commercial display unresolved**.
- Coverage and density vary by region; empty oceans are a **truthful** state.
- Free/dev throughput may throttle under large subscriptions — hence viewport + seed, not permanent global box.
- Not satellite-complete AIS; not a substitute for a licensed aggregator.

---

## 5. Vessel cache

- Keyed by **MMSI**
- Merge PositionReport + ShipStaticData
- Prune: age > ~6h and **max ~8000** entries (oldest first)
- Snapshot hide for very stale positions (existing freshness rules)
- API responses **capped** (lower at world zoom)

---

## 6. Ports

| Source | Role |
|--------|------|
| NGA WPI + UN/LOCODE (eastern-med import) | Regional detail |
| Curated major hubs (`catalog.global-majors.json`) | Global search + world-view density |

Zoom density: **major** (world) → **major+secondary** (regional) → all (local).

No fabricated berth/cargo/line data.

---

## 7. Visual corridors

Long-haul corridors use **visual** passage waypoints (Gibraltar, Suez, Malacca, Bab el-Mandeb, Cape, Atlantic, Pacific).  
These are **not** navigational routes.

Antimeridian: shorter-arc longitude deltas for distance/corridor midpoints.

---

## 8. Map performance

- Viewport-filtered API payloads
- MapLibre **clustering** below ~zoom 5
- Existing throttled `setData`, paused animation while interacting
- Debounced viewport fetches (client ~400ms + server ~750ms)

---

## 9. Semantics

**AIS-visible ≠ available / bookable / partner.**  
Global maritime **visibility** ≠ global commercial marketplace coverage.

Status badge wording:

> Global maritime view · development AIS feed

---

## 10. Production / licensing gate

Before any production claim of live AIS:

1. Confirm AISStream (or successor) **commercial / public-display** rights  
2. Or replace with a licensed terrestrial/satellite aggregator behind `MaritimeDataProvider`  
3. Do not scrape commercial AIS websites  

PostgreSQL, live email, malware scanner, payments — out of scope for this expansion.
