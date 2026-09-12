import type { GeoPoint, Port, VesselType } from "@/domain/models";

/** Extracted cargo details from a natural-language query (may be partial). */
export interface SearchCargoInfo {
  description?: string;
  quantityText?: string;
  quantityTons?: number;
}

/** Structured interpretation of a user query — before map rendering. */
export interface ParsedMaritimeQuery {
  rawQuery: string;
  originText?: string;
  destinationText?: string;
  cargo?: SearchCargoInfo;
  vesselType?: VesselType;
  /** How the query was interpreted. */
  interpreter: "deterministic" | "llm";
  /** BCP-47-ish language code from interpretation (UX only). */
  detectedLanguage?: string;
  /** Subtle human summary, e.g. "Rotterdam → Alexandria · 2,000 MT · steel". */
  interpretationSummary?: string;
}

export interface PortResolution {
  port: Port;
  score: number;
  matchReason: string;
}

export interface LocationResolutionResult {
  queryText: string;
  best?: PortResolution;
  candidates: PortResolution[];
  ambiguous: boolean;
}

/** Visual/search corridor — not an optimized navigation route. */
export interface MaritimeCorridor {
  id: string;
  kind: "visual_search_corridor";
  originPortId: string;
  destinationPortId: string;
  waypoints: GeoPoint[];
  /** Approximate corridor half-width in nautical miles for relevance. */
  corridorWidthNm: number;
}

export interface RelevantVesselHit {
  vesselId: string;
  mmsi?: string;
  score: number;
  reasons: string[];
}

/**
 * Canonical route-search state.
 * Designed so a later pricing/reservation flow can consume it unchanged.
 */
export interface RouteSearchState {
  id: string;
  status: "idle" | "loading" | "active" | "ambiguous" | "error";
  originalQuery: string;
  parsed?: ParsedMaritimeQuery;
  origin?: Port;
  destination?: Port;
  originCandidates?: PortResolution[];
  destinationCandidates?: PortResolution[];
  cargo?: SearchCargoInfo;
  vesselType?: VesselType;
  corridor?: MaritimeCorridor;
  relevantVesselIds: string[];
  relevantHits: RelevantVesselHit[];
  vesselTypeCounts: Partial<Record<VesselType | string, number>>;
  errorMessage?: string;
  /** Search-specific UX hint (language-aware where practical). */
  uxMessage?: string;
  /** Which interpreter produced the structured intent. */
  interpreterUsed?: "deterministic" | "openai";
  /** Catalogue resolution path (not model confidence). */
  resolutionOutcome?: "auto" | "candidates" | "clarification";
  /** True when OpenAI was attempted but deterministic fallback was used. */
  interpreterFallbackUsed?: boolean;
  /** Safe error code when OpenAI failed (never includes secrets or raw keys). */
  interpreterErrorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export function createIdleSearchState(): RouteSearchState {
  const now = new Date().toISOString();
  return {
    id: "search-idle",
    status: "idle",
    originalQuery: "",
    relevantVesselIds: [],
    relevantHits: [],
    vesselTypeCounts: {},
    createdAt: now,
    updatedAt: now,
  };
}
