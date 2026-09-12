import { z } from "zod";
import type { MaritimeSearchIntent } from "@/domain/search/intent";

const placeSchema = z.object({
  rawText: z.string().nullable(),
  interpretedName: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  portHint: z.string().nullable(),
});

const cargoSchema = z.object({
  description: z.string().nullable(),
  normalizedType: z.string().nullable(),
});

const quantitySchema = z.object({
  value: z.number().nullable(),
  unit: z.string().nullable(),
});

/** Strict Structured Outputs schema for OpenAI Responses API. */
export const maritimeSearchIntentSchema = z.object({
  detectedLanguage: z.string(),
  intent: z.enum(["ROUTE_SEARCH", "PORT_SEARCH", "VESSEL_SEARCH", "UNKNOWN"]),
  origin: placeSchema,
  destination: placeSchema,
  cargo: cargoSchema,
  quantity: quantitySchema,
  vesselTypeHint: z.string().nullable(),
  dateHint: z.string().nullable(),
  interpretationConfidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  clarificationNeeded: z.boolean(),
  clarificationReason: z.string().nullable(),
});

export type MaritimeSearchIntentParsed = z.infer<typeof maritimeSearchIntentSchema>;

export function validateMaritimeSearchIntent(
  value: unknown,
): MaritimeSearchIntent {
  return maritimeSearchIntentSchema.parse(value);
}

export function emptyPlaceIntent(): MaritimeSearchIntent["origin"] {
  return {
    rawText: null,
    interpretedName: null,
    city: null,
    country: null,
    region: null,
    portHint: null,
  };
}
