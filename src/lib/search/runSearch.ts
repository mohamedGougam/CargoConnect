import type { Vessel } from "@/domain/models";
import {
  createIdleSearchState,
  type RouteSearchState,
} from "@/domain/search/types";
import { buildMaritimeCorridor } from "./buildCorridor";
import { parseMaritimeQueryDeterministic } from "./parseQuery";
import { getSearchPortIndex } from "./portIndex";
import { resolveLocation } from "./resolvePorts";
import {
  applyDestinationTextBoost,
  countVesselTypes,
  scoreRelevantVessels,
} from "./scoreVessels";

export interface RunSearchInput {
  query: string;
  vessels: Vessel[];
}

/**
 * Orchestrate parse → resolve ports → corridor → vessel relevance.
 * Map rendering stays on the client.
 */
export function runMaritimeRouteSearch(input: RunSearchInput): RouteSearchState {
  const now = new Date().toISOString();
  const parsed = parseMaritimeQueryDeterministic(input.query);
  const ports = getSearchPortIndex();

  if (!parsed.originText || !parsed.destinationText) {
    return {
      ...createIdleSearchState(),
      id: `search-${Date.now()}`,
      status: "error",
      originalQuery: input.query,
      parsed,
      errorMessage:
        "Could not identify both a source and destination. Try “Rotterdam to Alexandria” or “Piraeus to Istanbul”.",
      createdAt: now,
      updatedAt: now,
    };
  }

  const originRes = resolveLocation(parsed.originText, ports);
  const destRes = resolveLocation(parsed.destinationText, ports);

  if (originRes.ambiguous || destRes.ambiguous || !originRes.best || !destRes.best) {
    return {
      ...createIdleSearchState(),
      id: `search-${Date.now()}`,
      status: "ambiguous",
      originalQuery: input.query,
      parsed,
      origin: originRes.best?.port,
      destination: destRes.best?.port,
      originCandidates: originRes.candidates,
      destinationCandidates: destRes.candidates,
      cargo: parsed.cargo,
      vesselType: parsed.vesselType,
      errorMessage: !originRes.best
        ? `Could not resolve origin “${parsed.originText}”.`
        : !destRes.best
          ? `Could not resolve destination “${parsed.destinationText}”.`
          : "Multiple matching ports — refine your query.",
      createdAt: now,
      updatedAt: now,
    };
  }

  const origin = originRes.best.port;
  const destination = destRes.best.port;
  const corridor = buildMaritimeCorridor(origin, destination);

  let hits = scoreRelevantVessels(input.vessels, {
    corridor,
    originLatLon: origin.position,
    destinationLatLon: destination.position,
    vesselType: parsed.vesselType,
    cargo: parsed.cargo,
  });

  hits = applyDestinationTextBoost(
    input.vessels,
    hits,
    destination.name,
    origin.name,
  );

  const relevantVesselIds = hits.map((h) => h.vesselId);

  return {
    id: `search-${Date.now()}`,
    status: "active",
    originalQuery: input.query,
    parsed,
    origin,
    destination,
    originCandidates: originRes.candidates,
    destinationCandidates: destRes.candidates,
    cargo: parsed.cargo,
    vesselType: parsed.vesselType,
    corridor,
    relevantVesselIds,
    relevantHits: hits,
    vesselTypeCounts: countVesselTypes(input.vessels, relevantVesselIds),
    createdAt: now,
    updatedAt: now,
  };
}
