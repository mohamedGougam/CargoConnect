# Quote comparison (CargoConnect)

## Purpose

Help shippers compare multiple broker/carrier responses for one `CommercialRequest`
and make a **human** commercial decision.

CargoConnect does **not** accept quotes, book cargo, or commit commercially in this phase.

## Architecture

```
CommercialQuotes (persisted)
  → effectiveQuote (apply corrections)
  → normalizeCommercialQuote
  → rankQuotes (deterministic)
  → GET /api/commercial/requests/:id/compare
  → Compare Quotes UI
```

Original broker emails remain immutable on `CommercialMessage`.

## Normalization

`NormalizedCommercialQuote` is a derived view. It never mutates stored extraction.

Includes:
- estimated freight amount (lump sum or rate × compatible quantity)
- normalized USD total **only when FX is enabled and a rate exists**
- transit day range, departure window, expiry state
- completeness score vs extraction confidence (separate)
- warnings for exclusions, currency, missing fields

## Rate basis

| Input | Behaviour |
| --- | --- |
| USD 42 / MT + 2000 MT | Estimated freight = 84,000 |
| EUR 80,000 lump sum | Use lump sum |
| Rate / m³ with tonnage only | **No** calculated total |

Mass↔volume conversions are never invented.

## FX

Feature-flagged (`FX_ENABLED=true`).

```
FX_RATES_JSON={"EUR":1.1,"GBP":1.27,"USD":1}   # currency → USD
FX_RATES_AS_OF=2026-09-10T00:00:00.000Z
FX_SOURCE=manual_config
```

Default: FX off. Different currencies are **not** treated as directly price-comparable.

## Ranking (deterministic)

Preferences:
- Best overall — weighted cost / departure / transit / completeness
- Lowest cost
- Fastest transit
- Earliest departure
- Custom weights

Default best-overall weights: cost 0.40, transit 0.25, departure 0.20, completeness 0.15.

Only dimensions with data participate. Expired quotes are de-emphasized.
Superseded versions are excluded from default ranking (`isLatest`).

Recommendations always include **Why** and **Trade-off** text — never opaque AI scores.

## Completeness vs confidence

- **Completeness**: share of commercial fields present (data coverage)
- **Extraction confidence**: how reliable the extraction was

Do not conflate these with broker trustworthiness.

## Manual correction

`PATCH /api/commercial/quotes/:id` with `{ patch: { freightRate, currency, ... } }`

- Ownership enforced
- Original values retained in `corrections[]`
- Broker message unchanged
- Audit: `QUOTE_CORRECTED`

## Revisions

Same organization sending a new monetary offer creates a new quote version:
- prior `isLatest=false`, `quoteStatus=SUPERSEDED`
- history remains visible
- Audit: `QUOTE_SUPERSEDED`

## UX

- Request detail: response/quote counts + **Compare Quotes**
- `/commercial/requests/[id]/compare`: table (desktop) + cards (mobile)
- Every quote links to original inbound message (`#msg-…`)

## Known limitations

- No live FX provider by default
- No “Accept quote” / booking
- Optional LLM narrative summary not required for ranking
- Departure parsing is heuristic for free-text laycan strings
