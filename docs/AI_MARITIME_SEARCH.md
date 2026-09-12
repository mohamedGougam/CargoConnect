# AI Maritime Search

CargoConnect uses OpenAI as a **language and intent interpretation layer** only.
Maritime facts always come from CargoConnect data and AIS.

Port resolution uses the global **WPI + UN/LOCODE** search index — see [PORT_SEARCH_CATALOGUE.md](./PORT_SEARCH_CATALOGUE.md).

## Separation of concerns (fundamental)

| Layer | Responsibility |
| --- | --- |
| **OpenAI** | Understand the user’s natural-language request (any language the model supports). Emit structured intent. |
| **CargoConnect port catalogue** | Resolve cities/countries/aliases to real ports (name, UN/LOCODE, coordinates). |
| **Route / corridor search** | Build the visual search corridor between resolved ports. |
| **Vessel relevance + AIS** | Score corridor-relevant observed vessels. Never “availability”. |

```
User query
  → deterministic fast path (parse + catalogue resolve)
  → if not high-confidence: OpenAI Maritime Intent Interpreter
  → Structured MaritimeSearchIntent
  → CargoConnect Port Resolver (source of truth)
  → existing route / vessel relevance pipeline
  → map
```

OpenAI must **not** replace: port database, route search, vessel scoring, AIS,
MaritimeDataProvider, or commercial workflows.

## Hybrid fast path

1. Run the deterministic parser and port resolver.
2. If origin and destination both resolve with catalogue confidence **auto** → continue immediately (no OpenAI call).
3. Otherwise, if `OPENAI_SEARCH_ENABLED=true` and `OPENAI_API_KEY` is set → interpret with OpenAI Structured Outputs, then resolve again against the catalogue.
4. If OpenAI is disabled, slow, rate-limited, or errors → fall back to deterministic results.

## Environment

```bash
# Server only — never NEXT_PUBLIC_OPENAI_API_KEY
OPENAI_API_KEY=
OPENAI_SEARCH_ENABLED=false
OPENAI_SEARCH_MODEL=gpt-5.6-luna
```

Enable for local demo only when a real key is configured:

```bash
OPENAI_SEARCH_ENABLED=true
OPENAI_API_KEY=sk-...
```

## Structured output

The Responses API returns a strict `MaritimeSearchIntent` (Zod-validated):

- `detectedLanguage`, `intent`
- `origin` / `destination` place hints (rawText, city, country, region, portHint)
- cargo / quantity / vesselTypeHint
- model-side `interpretationConfidence` and clarification flags

**Final ports are never taken from the model.** Coordinates, UN/LOCODE, and
canonical names always come from CargoConnect after resolution.

## Ambiguity UX

- Strong single match → auto-resolve.
- Several catalogue matches → show helpful candidates (not “Could not resolve origin…”).
- Genuinely vague geography → one short clarification.

## Observability

Structured log event `search.interpreter` includes:

- `interpreter`: `deterministic` | `openai`
- `language`
- `resolution`: `auto` | `candidates` | `clarification`
- latency / success / fallback

API keys and unnecessary PII are not logged.

## Cost control

- Short system prompt; query truncated.
- No AIS lists, full port DB, bookings, or profiles sent to OpenAI.
- Cost-efficient multilingual model via `OPENAI_SEARCH_MODEL` (default `gpt-5.6-luna`).

## Security

- User query treated as untrusted; prompt instructs the model to ignore embedded instructions.
- Structured output validated server-side with Zod.
- Existing search rate limits apply.
- Key is server-only.

## Tests

Automated tests inject a mock `MaritimeIntentInterpreter` and must not call the
real OpenAI API.
