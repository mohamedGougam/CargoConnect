import type { Port, Vessel } from "@/domain/models";
import type { RouteSearchState } from "@/domain/search/types";
import {
  NO_VERIFIED_RATE_NOTE,
  createEmptyCargo,
  type CommercialRequestDraft,
  type CommercialRequestType,
} from "@/domain/commercial/types";

export interface BuildDraftInput {
  type: CommercialRequestType;
  search: RouteSearchState;
  selectedVessel?: Vessel | null;
  selectedPort?: Port | null;
}

/**
 * Deterministic RouteSearchState → CommercialRequestDraft.
 * Does not re-parse natural language; does not invent price or contacts.
 */
export function buildCommercialRequestDraft(
  input: BuildDraftInput,
): CommercialRequestDraft {
  const { type, search, selectedVessel = null, selectedPort = null } = input;

  const origin = search.origin;
  const destination = search.destination;

  return {
    type,
    searchContext: search,
    origin,
    destination,
    selectedVessel,
    selectedPort,
    cargo: createEmptyCargo(search.cargo),
    preferredVesselType: search.vesselType,
    corridor: search.corridor,
    relevantVesselIds: [...search.relevantVesselIds],
    originalQuery: search.originalQuery,
    verifiedFreightRateAvailable: false,
    freightRateNote: NO_VERIFIED_RATE_NOTE,
    suggestedRecipientPortId: destination?.id ?? selectedPort?.id,
  };
}
