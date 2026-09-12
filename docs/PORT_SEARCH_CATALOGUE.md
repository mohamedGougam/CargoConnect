# Global Port Search Catalogue

## Primary source

Search resolution uses **`src/data/ports/port-search-index.json`**, built from:

1. **NGA World Port Index** (`data/raw/UpdatedPub150.csv` or `data/raw/wpi-*.fixture.csv`)
2. **UNECE UN/LOCODE** (`data/raw/unlocode.csv` or `data/raw/unlocode-*.fixture.csv`)

Hand-curated `catalog.global-majors.json` is **not** the primary search source (map density may still use it via `PortCatalog`).

```bash
npm run ports:build-index   # regenerate search index
npm run ports:coverage      # diagnostic report
```

Place full dumps under `data/raw/` (gitignored) and rebuild for production-scale coverage. Committed fixtures keep CI deterministic.

## Searchable record

Each index entry includes:

- canonical port name
- aliases (WPI alternate names, UN/LOCODE names)
- city
- country (+ ISO country code)
- UN/LOCODE
- latitude / longitude
- sources / provenance (`NGA_WPI`, `UN_LOCODE`)

## Resolution order

1. Exact UN/LOCODE  
2. Exact canonical name  
3. Normalized alias  
4. Exact city  
5. Nearby / serving ports for city (**explicit same-country config only**)  
6. Country-level candidates (**same country only**)  
7. Clarification  

Confidence (independent of OpenAI):

| Level | Meaning |
| --- | --- |
| HIGH | Exact port / city / UNLOCODE |
| MEDIUM | Explicit city→serving-port mapping |
| LOW | Country / region candidate list |

City→port maps live in `src/lib/search/cityServingPorts.ts`. Cross-country serving maps are rejected in CI.

## OPENAI vs catalogue

OpenAI interprets language/intent only. Final ports always come from this catalogue.
