import type { Port, Vessel, VesselType } from "@/domain/models";
import type {
  RouteSearchState,
  SearchCargoInfo,
  SmartPortOption,
} from "@/domain/search/types";
import { countAisDestinationVessels } from "@/lib/search/aisDestinationMatch";
import { buildMaritimeCorridor } from "@/lib/search/buildCorridor";
import { estimateMaritimeDistanceNm } from "@/lib/search/maritimeDistance";
import {
  applyDestinationTextBoost,
  countVesselTypes,
  scoreRelevantVessels,
} from "@/lib/search/scoreVessels";
import type { PortResolution } from "@/domain/search/types";

export function buildDestinationOptions(
  origin: Port,
  candidates: PortResolution[],
  vessels: Vessel[],
): SmartPortOption[] {
  const options: SmartPortOption[] = candidates.map((c) => ({
    port: c.port,
    estimatedDistanceNm: estimateMaritimeDistanceNm(origin, c.port).distanceNm,
    aisDestinationVesselCount: countAisDestinationVessels(vessels, c.port),
    confidence: c.confidence,
  }));
  options.sort(
    (a, b) =>
      a.estimatedDistanceNm - b.estimatedDistanceNm ||
      a.port.name.localeCompare(b.port.name),
  );
  return options;
}

/** Rank origin candidates by estimated maritime distance to a fixed destination. */
export function buildOriginOptions(
  destination: Port,
  candidates: PortResolution[],
  vessels: Vessel[],
): SmartPortOption[] {
  const options: SmartPortOption[] = candidates.map((c) => ({
    port: c.port,
    estimatedDistanceNm: estimateMaritimeDistanceNm(c.port, destination).distanceNm,
    aisDestinationVesselCount: countAisDestinationVessels(vessels, c.port),
    confidence: c.confidence,
  }));
  options.sort(
    (a, b) =>
      a.estimatedDistanceNm - b.estimatedDistanceNm ||
      a.port.name.localeCompare(b.port.name),
  );
  return options;
}

/**
 * When both origin and destination are multi-port countries/regions, pick the
 * origin–destination pair with the shortest estimated maritime distance.
 */
export function pickNearestOriginDestinationPair(
  originCandidates: PortResolution[],
  destinationCandidates: PortResolution[],
): { origin: Port; destination: Port; distanceNm: number } | null {
  let best: { origin: Port; destination: Port; distanceNm: number } | null =
    null;
  for (const originHit of originCandidates) {
    for (const destHit of destinationCandidates) {
      const distanceNm = estimateMaritimeDistanceNm(
        originHit.port,
        destHit.port,
      ).distanceNm;
      if (
        !best ||
        distanceNm < best.distanceNm ||
        (distanceNm === best.distanceNm &&
          `${originHit.port.name}|${destHit.port.name}` <
            `${best.origin.name}|${best.destination.name}`)
      ) {
        best = {
          origin: originHit.port,
          destination: destHit.port,
          distanceNm,
        };
      }
    }
  }
  return best;
}

export function activateRouteSearch(params: {
  id?: string;
  originalQuery: string;
  parsed?: RouteSearchState["parsed"];
  origin: Port;
  destination: Port;
  vessels: Vessel[];
  cargo?: SearchCargoInfo;
  vesselType?: VesselType;
  originCandidates?: PortResolution[];
  destinationCandidates?: PortResolution[];
  destinationOptions?: SmartPortOption[];
  originOptions?: SmartPortOption[];
  requestedDestinationLabel?: string;
  requestedOriginLabel?: string;
  destinationSelectionReason?: RouteSearchState["destinationSelectionReason"];
  originSelectionReason?: RouteSearchState["originSelectionReason"];
  interpreterUsed?: RouteSearchState["interpreterUsed"];
  interpreterFallbackUsed?: boolean;
  interpreterErrorCode?: string;
  resolutionOutcome?: RouteSearchState["resolutionOutcome"];
  now?: string;
}): RouteSearchState {
  const now = params.now ?? new Date().toISOString();
  const corridor = buildMaritimeCorridor(params.origin, params.destination);

  let hits = scoreRelevantVessels(params.vessels, {
    corridor,
    originLatLon: params.origin.position,
    destinationLatLon: params.destination.position,
    vesselType: params.vesselType,
    cargo: params.cargo,
  });
  hits = applyDestinationTextBoost(
    params.vessels,
    hits,
    params.destination.name,
    params.origin.name,
  );
  const relevantVesselIds = hits.map((h) => h.vesselId);

  return {
    id: params.id ?? `search-${Date.now()}`,
    status: "active",
    originalQuery: params.originalQuery,
    parsed: params.parsed,
    origin: params.origin,
    destination: params.destination,
    originCandidates: params.originCandidates,
    destinationCandidates: params.destinationCandidates,
    destinationOptions: params.destinationOptions,
    originOptions: params.originOptions,
    requestedDestinationLabel: params.requestedDestinationLabel,
    requestedOriginLabel: params.requestedOriginLabel,
    destinationSelectionReason: params.destinationSelectionReason ?? "exact",
    originSelectionReason: params.originSelectionReason ?? "exact",
    cargo: params.cargo,
    vesselType: params.vesselType,
    corridor,
    relevantVesselIds,
    relevantHits: hits,
    vesselTypeCounts: countVesselTypes(params.vessels, relevantVesselIds),
    interpreterUsed: params.interpreterUsed,
    interpreterFallbackUsed: params.interpreterFallbackUsed,
    interpreterErrorCode: params.interpreterErrorCode,
    resolutionOutcome: params.resolutionOutcome ?? "auto",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Switch destination among ranked options without re-interpreting the query.
 */
export function switchSearchDestination(
  search: RouteSearchState,
  destinationPortId: string,
  vessels: Vessel[],
): RouteSearchState {
  if (!search.origin) return search;
  const options = search.destinationOptions ?? [];
  const selected =
    options.find((o) => o.port.id === destinationPortId)?.port ??
    search.destinationCandidates?.find((c) => c.port.id === destinationPortId)
      ?.port;
  if (!selected) return search;

  const refreshedOptions =
    options.length > 0
      ? buildDestinationOptions(
          search.origin,
          options.map((o) => ({
            port: o.port,
            score: 80,
            matchReason: "country_level_candidate",
            confidence: o.confidence,
          })),
          vessels,
        )
      : undefined;

  return activateRouteSearch({
    id: search.id,
    originalQuery: search.originalQuery,
    parsed: search.parsed,
    origin: search.origin,
    destination: selected,
    vessels,
    cargo: search.cargo,
    vesselType: search.vesselType,
    originCandidates: search.originCandidates,
    destinationCandidates: search.destinationCandidates,
    destinationOptions: refreshedOptions,
    originOptions: search.originOptions,
    requestedDestinationLabel: search.requestedDestinationLabel,
    requestedOriginLabel: search.requestedOriginLabel,
    destinationSelectionReason: "user_selected",
    originSelectionReason: search.originSelectionReason,
    interpreterUsed: search.interpreterUsed,
    interpreterFallbackUsed: search.interpreterFallbackUsed,
    interpreterErrorCode: search.interpreterErrorCode,
    resolutionOutcome: search.resolutionOutcome,
  });
}
