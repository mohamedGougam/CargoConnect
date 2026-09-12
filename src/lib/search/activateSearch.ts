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
  requestedDestinationLabel?: string;
  requestedOriginLabel?: string;
  destinationSelectionReason?: RouteSearchState["destinationSelectionReason"];
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
    requestedDestinationLabel: params.requestedDestinationLabel,
    requestedOriginLabel: params.requestedOriginLabel,
    destinationSelectionReason: params.destinationSelectionReason ?? "exact",
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
    requestedDestinationLabel: search.requestedDestinationLabel,
    requestedOriginLabel: search.requestedOriginLabel,
    destinationSelectionReason: "user_selected",
    interpreterUsed: search.interpreterUsed,
    interpreterFallbackUsed: search.interpreterFallbackUsed,
    interpreterErrorCode: search.interpreterErrorCode,
    resolutionOutcome: search.resolutionOutcome,
  });
}
