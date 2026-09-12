import type { Vessel } from "@/domain/models";
import {
  createIdleSearchState,
  type RouteSearchState,
} from "@/domain/search/types";
import { logger } from "@/server/ops/logger";
import { getDefaultMaritimeIntentInterpreter } from "./intent/createInterpreter";
import {
  DeterministicInterpreter,
  intentToParsedQuery,
} from "./intent/deterministicInterpreter";
import type { MaritimeIntentInterpreter } from "./intent/MaritimeIntentInterpreter";
import { isOpenAiSearchEnabled } from "./intent/config";
import { getSearchPortIndex } from "./portIndex";
import {
  classifyLocationResolution,
  mergeResolutionOutcomes,
} from "./resolutionConfidence";
import { resolveLocation } from "./resolvePorts";
import { resolvePlaceIntent } from "./resolvePlaceIntent";
import {
  ambiguousBothMessage,
  ambiguousNearMessage,
  clarificationMessage,
} from "./uxMessages";
import {
  activateRouteSearch,
  buildDestinationOptions,
} from "./activateSearch";

export interface RunSearchInput {
  query: string;
  vessels: Vessel[];
  /** Injectable interpreter (tests / overrides). */
  interpreter?: MaritimeIntentInterpreter;
  /** Force skip OpenAI even when enabled (tests). */
  deterministicOnly?: boolean;
}

/**
 * Orchestrate interpret → resolve ports → corridor → vessel relevance.
 * Hybrid: deterministic fast path when both ports resolve confidently;
 * otherwise OpenAI interpretation (when enabled) then catalogue resolution.
 */
export async function runMaritimeRouteSearch(
  input: RunSearchInput,
): Promise<RouteSearchState> {
  const now = new Date().toISOString();
  const ports = getSearchPortIndex();
  const started = Date.now();

  const deterministic = new DeterministicInterpreter();
  const detResult = await deterministic.interpret({ query: input.query });
  let parsed = intentToParsedQuery(
    detResult.intent,
    input.query,
    "deterministic",
  );

  let originRes = resolveLocation(parsed.originText, ports);
  let destRes = resolveLocation(parsed.destinationText, ports);
  let originOutcome = classifyLocationResolution(originRes);
  let destOutcome = classifyLocationResolution(destRes);
  let interpreterUsed: "deterministic" | "openai" = "deterministic";
  let interpretLatency = detResult.latencyMs;
  let fallbackUsed = false;
  let interpreterErrorCode: string | undefined;

  const deterministicStrong =
    Boolean(parsed.originText && parsed.destinationText) &&
    originOutcome === "auto" &&
    destOutcome === "auto" &&
    originRes.best &&
    destRes.best;

  const shouldTryOpenAi =
    !input.deterministicOnly &&
    !deterministicStrong &&
    (Boolean(input.interpreter) || isOpenAiSearchEnabled());

  if (shouldTryOpenAi) {
    const interpreter =
      input.interpreter ?? getDefaultMaritimeIntentInterpreter();
    const aiResult = await interpreter.interpret({ query: input.query });
    interpretLatency = aiResult.latencyMs;
    fallbackUsed = Boolean(aiResult.fallbackUsed);
    if (aiResult.errorCode) interpreterErrorCode = aiResult.errorCode;

    if (aiResult.source === "openai" || !deterministicStrong) {
      const aiParsed = intentToParsedQuery(
        aiResult.intent,
        input.query,
        aiResult.source === "openai" ? "llm" : "deterministic",
      );
      // Prefer multi-field catalogue resolution from structured intent
      const aiOrigin =
        aiResult.source === "openai"
          ? resolvePlaceIntent(aiResult.intent.origin, ports)
          : resolveLocation(aiParsed.originText, ports);
      const aiDest =
        aiResult.source === "openai"
          ? resolvePlaceIntent(aiResult.intent.destination, ports)
          : resolveLocation(aiParsed.destinationText, ports);
      const aiOriginOutcome = classifyLocationResolution(aiOrigin);
      const aiDestOutcome = classifyLocationResolution(aiDest);

      const aiBetter =
        aiResult.source === "openai" &&
        (scoreOutcome(aiOriginOutcome, aiDestOutcome) >
          scoreOutcome(originOutcome, destOutcome) ||
          (!parsed.originText || !parsed.destinationText) ||
          originOutcome !== "auto" ||
          destOutcome !== "auto");

      if (aiBetter || aiResult.source === "openai") {
        parsed = aiParsed;
        originRes = aiOrigin;
        destRes = aiDest;
        originOutcome = aiOriginOutcome;
        destOutcome = aiDestOutcome;
        interpreterUsed = aiResult.source === "openai" ? "openai" : "deterministic";
      }
    }
  }

  const resolutionOutcome = mergeResolutionOutcomes(originOutcome, destOutcome);
  const language = parsed.detectedLanguage;

  logger.info("search.interpreter", {
    interpreter: interpreterUsed,
    language: language ?? null,
    resolution: resolutionOutcome,
    durationMs: Date.now() - started,
    interpretLatencyMs: interpretLatency,
    fallbackUsed,
    errorCode: interpreterErrorCode ?? null,
    success: resolutionOutcome === "auto",
  });

  const interpretMeta = {
    interpreterUsed,
    interpreterFallbackUsed: fallbackUsed,
    interpreterErrorCode,
  };

  if (!parsed.originText || !parsed.destinationText) {
    return {
      ...createIdleSearchState(),
      id: `search-${Date.now()}`,
      status: "error",
      originalQuery: input.query,
      parsed,
      ...interpretMeta,
      resolutionOutcome: "clarification",
      uxMessage: clarificationMessage(
        detResult.intent.clarificationReason,
        language,
      ),
      errorMessage: clarificationMessage(
        "Could not identify both a source and destination. Try “Rotterdam to Alexandria” or “Barcelona to Algiers”.",
        language,
      ),
      createdAt: now,
      updatedAt: now,
    };
  }

  if (
    resolutionOutcome !== "auto" ||
    !originRes.best ||
    !destRes.best
  ) {
    // Exact/auto origin + multiple destination candidates → auto-select nearest
    if (
      originOutcome === "auto" &&
      originRes.best &&
      destOutcome === "candidates" &&
      destRes.candidates.length > 0
    ) {
      const origin = originRes.best.port;
      const destinationOptions = buildDestinationOptions(
        origin,
        destRes.candidates,
        input.vessels,
      );
      const nearest = destinationOptions[0];
      if (nearest) {
        return activateRouteSearch({
          originalQuery: input.query,
          parsed,
          origin,
          destination: nearest.port,
          vessels: input.vessels,
          cargo: parsed.cargo,
          vesselType: parsed.vesselType,
          originCandidates: originRes.candidates,
          destinationCandidates: destRes.candidates,
          destinationOptions,
          requestedDestinationLabel: destRes.queryText || parsed.destinationText,
          requestedOriginLabel: originRes.queryText || parsed.originText,
          destinationSelectionReason: "shortest_maritime_distance",
          ...interpretMeta,
          resolutionOutcome: "candidates",
          now,
        });
      }
    }

    const ux =
      originOutcome === "auto" && destOutcome === "candidates" && destRes.queryText
        ? ambiguousNearMessage(destRes.queryText, language)
        : destOutcome === "auto" &&
            originOutcome === "candidates" &&
            originRes.queryText
          ? ambiguousNearMessage(originRes.queryText, language)
          : originOutcome === "candidates" && originRes.queryText
            ? ambiguousNearMessage(originRes.queryText, language)
            : destOutcome === "candidates" && destRes.queryText
              ? ambiguousNearMessage(destRes.queryText, language)
              : resolutionOutcome === "clarification"
                ? clarificationMessage(null, language)
                : ambiguousBothMessage(language);

    return {
      ...createIdleSearchState(),
      id: `search-${Date.now()}`,
      status: "ambiguous",
      originalQuery: input.query,
      parsed,
      origin: originRes.best?.port,
      destination: destRes.best?.port,
      originCandidates:
        originOutcome === "auto" ? undefined : originRes.candidates,
      destinationCandidates:
        destOutcome === "auto" ? undefined : destRes.candidates,
      cargo: parsed.cargo,
      vesselType: parsed.vesselType,
      ...interpretMeta,
      resolutionOutcome,
      uxMessage: ux,
      errorMessage: ux,
      requestedDestinationLabel:
        destOutcome === "candidates"
          ? destRes.queryText || parsed.destinationText
          : undefined,
      requestedOriginLabel:
        originOutcome === "candidates"
          ? originRes.queryText || parsed.originText
          : undefined,
      createdAt: now,
      updatedAt: now,
    };
  }

  const origin = originRes.best.port;
  const destination = destRes.best.port;

  return activateRouteSearch({
    originalQuery: input.query,
    parsed,
    origin,
    destination,
    vessels: input.vessels,
    cargo: parsed.cargo,
    vesselType: parsed.vesselType,
    originCandidates: originRes.candidates,
    destinationCandidates: destRes.candidates,
    destinationSelectionReason: "exact",
    requestedOriginLabel: parsed.originText,
    requestedDestinationLabel: parsed.destinationText,
    ...interpretMeta,
    resolutionOutcome: "auto",
    now,
  });
}

function scoreOutcome(
  origin: ReturnType<typeof classifyLocationResolution>,
  dest: ReturnType<typeof classifyLocationResolution>,
): number {
  const rank = (o: string) =>
    o === "auto" ? 3 : o === "candidates" ? 2 : 1;
  return rank(origin) + rank(dest);
}
