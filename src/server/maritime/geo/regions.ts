/**
 * Named maritime regions for partitioning, diagnostics, and seed coverage.
 * Not product restrictions — internal load / debug aids only.
 */

import type { AisBoundingBox } from "./bbox";

export interface MaritimeRegion {
  id: string;
  label: string;
  /** AISStream SW/NE [lat, lon] corners. */
  box: AisBoundingBox;
}

export const MARITIME_REGIONS: MaritimeRegion[] = [
  {
    id: "north_sea",
    label: "North Sea",
    box: { sw: [51.0, -2.0], ne: [58.5, 9.0] },
  },
  {
    id: "baltic",
    label: "Baltic",
    box: { sw: [53.5, 10.0], ne: [66.0, 30.0] },
  },
  {
    id: "mediterranean",
    label: "Mediterranean",
    box: { sw: [30.0, -6.0], ne: [46.0, 37.0] },
  },
  {
    id: "eastern_med",
    label: "Eastern Mediterranean",
    box: { sw: [30.0, 22.0], ne: [41.5, 37.0] },
  },
  {
    id: "black_sea",
    label: "Black Sea",
    box: { sw: [40.5, 27.0], ne: [47.5, 42.0] },
  },
  {
    id: "arabian_gulf",
    label: "Arabian Gulf",
    box: { sw: [23.5, 48.0], ne: [30.5, 57.0] },
  },
  {
    id: "red_sea",
    label: "Red Sea",
    box: { sw: [12.0, 32.0], ne: [30.0, 44.0] },
  },
  {
    id: "indian_ocean_west",
    label: "Western Indian Ocean",
    box: { sw: [-35.0, 30.0], ne: [15.0, 75.0] },
  },
  {
    id: "southeast_asia",
    label: "Southeast Asia / Malacca",
    box: { sw: [-5.0, 95.0], ne: [15.0, 120.0] },
  },
  {
    id: "east_asia",
    label: "East Asia",
    box: { sw: [22.0, 115.0], ne: [42.0, 145.0] },
  },
  {
    id: "australia",
    label: "Australia",
    box: { sw: [-44.0, 110.0], ne: [-10.0, 155.0] },
  },
  {
    id: "us_east",
    label: "US East Coast",
    box: { sw: [24.0, -82.0], ne: [45.0, -65.0] },
  },
  {
    id: "us_west",
    label: "US West Coast",
    box: { sw: [32.0, -125.0], ne: [49.0, -116.0] },
  },
  {
    id: "gulf_of_mexico",
    label: "Gulf of Mexico",
    box: { sw: [18.0, -98.0], ne: [31.0, -80.0] },
  },
  {
    id: "south_america_east",
    label: "South America East",
    box: { sw: [-40.0, -60.0], ne: [5.0, -34.0] },
  },
  {
    id: "southern_africa",
    label: "Southern Africa",
    box: { sw: [-36.0, 14.0], ne: [-22.0, 40.0] },
  },
  {
    id: "panama",
    label: "Panama Canal approaches",
    box: { sw: [7.0, -82.0], ne: [11.5, -77.0] },
  },
];

/**
 * Seed boxes kept warm so the flagship Rotterdam→Alexandria demo
 * and Eastern Med still receive AIS without waiting for a pan.
 */
export const SEED_REGION_IDS = ["eastern_med", "north_sea", "mediterranean"] as const;

export function seedAisBoxes(): AisBoundingBox[] {
  return MARITIME_REGIONS.filter((r) =>
    (SEED_REGION_IDS as readonly string[]).includes(r.id),
  ).map((r) => r.box);
}

export function regionOverlapping(
  box: AisBoundingBox,
): MaritimeRegion[] {
  const south = Math.min(box.sw[0], box.ne[0]);
  const north = Math.max(box.sw[0], box.ne[0]);
  const west = Math.min(box.sw[1], box.ne[1]);
  const east = Math.max(box.sw[1], box.ne[1]);
  return MARITIME_REGIONS.filter((r) => {
    const rs = Math.min(r.box.sw[0], r.box.ne[0]);
    const rn = Math.max(r.box.sw[0], r.box.ne[0]);
    const rw = Math.min(r.box.sw[1], r.box.ne[1]);
    const re = Math.max(r.box.sw[1], r.box.ne[1]);
    return !(rn < south || rs > north || re < west || rw > east);
  });
}
