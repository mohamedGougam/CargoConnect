# Global Port Search Catalogue

## Primary source (runtime)

Search resolution uses the **committed generated index**:

`src/data/ports/port-search-index.json`

Built from:

1. **NGA World Port Index** — `data/raw/UpdatedPub150.csv` (gitignored full dump)
2. **UNECE UN/LOCODE** — `data/raw/unlocode.csv` (gitignored full dump)

Hand-curated `catalog.global-majors.json` is **not** the primary search source.

### Refresh / rebuild (one clear path)

```bash
npm run ports:fetch-sources   # download full WPI + UN/LOCODE into data/raw/
npm run ports:build-index     # regenerate + overwrite the committed runtime JSON
npm run ports:coverage        # validate global coverage / reject fixture-scale indexes
```

Then commit the updated `src/data/ports/port-search-index.json` so Render receives the same catalogue via normal `git push` → build. Render does **not** download CSVs at deploy time.

## Fixture vs runtime separation

| Path | Role |
| --- | --- |
| `data/fixtures/ports/*.csv` | Small deterministic CSVs for local/fixture builds |
| `data/raw/UpdatedPub150.csv`, `data/raw/unlocode.csv` | Full source dumps (gitignored) |
| `src/data/ports/port-search-index.json` | **Runtime** global index (committed, deployed) |
| `src/data/ports/port-search-index.fixture.json` | Optional fixture build output (`npm run ports:build-index:fixture`) |

**Critical:** runtime builds never mix fixture CSVs. That failure mode previously shipped ~64 ports / ~32 countries and made Tunis appear “missing”.

## Deployment strategy

Preferred (current):

1. Generate the full normalized index locally (or in CI with fetch + build).
2. **Commit** the generated JSON (WPI is U.S. Government work; UN/LOCODE redistributable per UNECE terms).
3. Render `npm run build` only bundles the committed index — deterministic, no SSH, no manual CSV upload.

## Provenance

Each record keeps:

- canonical name, aliases, city, country, country code
- UN/LOCODE (when known)
- lat / lon
- `sources`: `NGA_WPI`, `UN_LOCODE`, or both
- WPI number / harbor size when from WPI

## Resolution order

1. Exact UN/LOCODE  
2. Exact canonical name  
3. Normalized alias  
4. Exact city  
5. Nearby / serving ports for city (**explicit same-country config only**)  
6. Country-level candidates (**same country only**, top hubs by harbor tier)  
7. Clarification / catalogue coverage failure  

If intent names a place but the catalogue has zero maritime matches, the outcome is **`catalogue_no_match`** (not “One more detail” user ambiguity).

## Coverage validation

```bash
npm run ports:coverage
```

Reports totals and guard-country presence (Netherlands, Norway, Tunisia, Algeria, Morocco, Egypt, Greece, Spain, Germany, United States, Brazil, South Africa, UAE, India, Singapore, Malaysia, China, Japan, Australia).

Tiny / fixture-scale indexes emit **`PORT_CATALOGUE_INCOMPLETE`** (also surfaced on `/api/health/ready` and `/api/maritime/diagnostics`).

## OPENAI vs catalogue

OpenAI interprets language/intent only. Final ports always come from this catalogue — never invented coordinates or UN/LOCODEs from the model.
