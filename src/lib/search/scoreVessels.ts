import type { Vessel, VesselType } from "@/domain/models";
import type {
  MaritimeCorridor,
  RelevantVesselHit,
  SearchCargoInfo,
} from "@/domain/search/types";
import {
  angleDelta,
  bearingDegrees,
  distancePointToPolylineKm,
  haversineKm,
} from "./buildCorridor";

const NM_TO_KM = 1.852;

export interface ScoreVesselsOptions {
  corridor: MaritimeCorridor;
  originLatLon: { latitude: number; longitude: number };
  destinationLatLon: { latitude: number; longitude: number };
  vesselType?: VesselType;
  cargo?: SearchCargoInfo;
  /** Max vessels to keep as "relevant". */
  limit?: number;
  /** Minimum score 0–100. */
  minScore?: number;
}

/**
 * Deterministic corridor relevance — maritime proximity / heading / type.
 * Does NOT imply commercial availability.
 */
export function scoreRelevantVessels(
  vessels: Vessel[],
  options: ScoreVesselsOptions,
): RelevantVesselHit[] {
  const {
    corridor,
    originLatLon,
    destinationLatLon,
    vesselType,
    limit = 40,
    minScore = 28,
  } = options;

  const widthKm = corridor.corridorWidthNm * NM_TO_KM;
  const hits: RelevantVesselHit[] = [];

  for (const vessel of vessels) {
    const reasons: string[] = [];
    let score = 0;

    const distKm = distancePointToPolylineKm(vessel.position, corridor.waypoints);
    if (distKm > widthKm * 1.35) continue;

    // Proximity to corridor (0–45)
    const proximity = Math.max(0, 1 - distKm / widthKm);
    score += proximity * 45;
    if (proximity > 0.55) reasons.push("near_corridor");

    // Heading aligned with corridor direction toward destination (0–25)
    const course = vessel.course ?? vessel.heading;
    if (course !== undefined) {
      const along = bearingDegrees(vessel.position, destinationLatLon);
      const delta = angleDelta(course, along);
      if (delta < 45) {
        score += 25 * (1 - delta / 45);
        reasons.push("heading_along_corridor");
      } else if (delta < 90) {
        score += 10 * (1 - (delta - 45) / 45);
      }
    }

    // Closer to origin or destination hubs (0–15)
    const dOrigin = haversineKm(vessel.position, originLatLon);
    const dDest = haversineKm(vessel.position, destinationLatLon);
    const hub = Math.min(dOrigin, dDest);
    if (hub < 250) {
      score += 15 * (1 - hub / 250);
      reasons.push(dOrigin < dDest ? "near_origin" : "near_destination");
    }

    // Vessel type filter
    if (vesselType) {
      if (vessel.type === vesselType) {
        score += 12;
        reasons.push("matching_vessel_type");
      } else if (vessel.type === "unknown" || vessel.type === "other") {
        score += 2;
      } else {
        score *= 0.35;
        reasons.push("type_mismatch_penalty");
      }
    }

    // Freshness
    const freshness = vessel.meta?.freshness;
    if (freshness === "live") {
      score += 8;
      reasons.push("fresh_position");
    } else if (freshness === "stale") {
      score += 2;
    } else if (freshness === "very_stale") {
      score *= 0.5;
    }

    // Underway preference lightly
    if (vessel.status === "underway" && (vessel.speed ?? 0) > 1) {
      score += 5;
      reasons.push("underway");
    }

    score = Math.round(Math.min(100, score));
    if (score < minScore) continue;

    hits.push({
      vesselId: vessel.id,
      mmsi: vessel.mmsi,
      score,
      reasons,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

export function applyDestinationTextBoost(
  vessels: Vessel[],
  hits: RelevantVesselHit[],
  destinationName: string,
  originName: string,
): RelevantVesselHit[] {
  const dest = destinationName.toLowerCase();
  const origin = originName.toLowerCase();
  const byId = new Map(hits.map((h) => [h.vesselId, { ...h }]));

  for (const vessel of vessels) {
    const hit = byId.get(vessel.id);
    if (!hit || !vessel.destinationRaw) continue;
    const raw = vessel.destinationRaw.toLowerCase();
    if (raw.includes(dest.slice(0, Math.min(5, dest.length))) && dest.length >= 4) {
      hit.score = Math.min(100, hit.score + 12);
      if (!hit.reasons.includes("ais_destination_text")) {
        hit.reasons.push("ais_destination_text");
      }
    } else if (raw.includes(origin.slice(0, Math.min(5, origin.length)))) {
      hit.score = Math.min(100, hit.score + 4);
    }
    byId.set(vessel.id, hit);
  }

  return Array.from(byId.values()).sort((a, b) => b.score - a.score);
}

export function countVesselTypes(
  vessels: Vessel[],
  relevantIds: string[],
): Partial<Record<string, number>> {
  const set = new Set(relevantIds);
  const counts: Partial<Record<string, number>> = {};
  for (const v of vessels) {
    if (!set.has(v.id)) continue;
    const key = v.type || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
