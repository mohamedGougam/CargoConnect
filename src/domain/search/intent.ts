/**
 * Structured maritime search intent — OpenAI interprets language;
 * CargoConnect data remains the source of truth for ports/vessels.
 */

export type MaritimeSearchIntentKind =
  | "ROUTE_SEARCH"
  | "PORT_SEARCH"
  | "VESSEL_SEARCH"
  | "UNKNOWN";

export type InterpretationConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface MaritimePlaceIntent {
  rawText: string | null;
  interpretedName: string | null;
  city: string | null;
  country: string | null;
  region: string | null;
  portHint: string | null;
}

export interface MaritimeCargoIntent {
  description: string | null;
  normalizedType: string | null;
}

export interface MaritimeQuantityIntent {
  value: number | null;
  unit: string | null;
}

export interface MaritimeSearchIntent {
  detectedLanguage: string;
  intent: MaritimeSearchIntentKind;
  origin: MaritimePlaceIntent;
  destination: MaritimePlaceIntent;
  cargo: MaritimeCargoIntent;
  quantity: MaritimeQuantityIntent;
  vesselTypeHint: string | null;
  dateHint: string | null;
  interpretationConfidence: InterpretationConfidence;
  clarificationNeeded: boolean;
  clarificationReason: string | null;
}

/** Deterministic resolution outcome after catalogue matching. */
export type PortResolutionOutcome =
  | "auto"
  | "candidates"
  | "clarification"
  | "catalogue_no_match";

export type SearchInterpreterKind = "deterministic" | "openai";
