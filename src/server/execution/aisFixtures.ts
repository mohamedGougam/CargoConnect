import type { Vessel } from "@/domain/models";

/** Deterministic vessel observation fixtures for tests — not live AIS. */
export type AisFixtureScenario =
  | "NEAR_ROTTERDAM"
  | "LEFT_ROTTERDAM"
  | "UNDERWAY_MED"
  | "NEAR_ALEXANDRIA"
  | "STALE"
  | "VESSEL_CHANGE_ORION";

const NOW = () => new Date().toISOString();

export function buildAisFixtureVessel(
  scenario: AisFixtureScenario,
  overrides?: Partial<Vessel>,
): Vessel {
  const base: Vessel = {
    id: "mmsi:244123456",
    name: "MV Atlas",
    mmsi: "244123456",
    imo: "9123456",
    type: "bulk_carrier",
    cargoCategory: "Bulk",
    position: { latitude: 51.95, longitude: 4.48 },
    speed: 0.2,
    course: 90,
    heading: 90,
    navStatus: "Moored",
    destinationRaw: "ALEXANDRIA",
    eta: "2026-09-18T00:00:00.000Z",
    status: "moored",
    meta: {
      source: "AISSTREAM",
      sourceTimestamp: NOW(),
      freshness: "live",
      dataQuality: "demo",
    },
  };

  switch (scenario) {
    case "NEAR_ROTTERDAM":
      return {
        ...base,
        ...overrides,
        position: { latitude: 51.92, longitude: 4.45 },
        speed: 1.5,
        status: "underway",
        navStatus: "Under way using engine",
      };
    case "LEFT_ROTTERDAM":
      return {
        ...base,
        ...overrides,
        position: { latitude: 51.55, longitude: 3.2 },
        speed: 11.2,
        course: 220,
        status: "underway",
        navStatus: "Under way using engine",
      };
    case "UNDERWAY_MED":
      return {
        ...base,
        ...overrides,
        position: { latitude: 36.5, longitude: 15.2 },
        speed: 12.4,
        course: 110,
        status: "underway",
        navStatus: "Under way using engine",
        destinationRaw: "ALEXANDRIA",
        eta: "2026-09-17T22:00:00.000Z",
      };
    case "NEAR_ALEXANDRIA":
      return {
        ...base,
        ...overrides,
        position: { latitude: 31.25, longitude: 29.85 },
        speed: 4.1,
        status: "underway",
        navStatus: "Under way using engine",
      };
    case "STALE": {
      const staleAt = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
      return {
        ...base,
        ...overrides,
        position: { latitude: 36.5, longitude: 15.2 },
        speed: 12.4,
        status: "underway",
        meta: {
          source: "AISSTREAM",
          sourceTimestamp: staleAt,
          freshness: "stale",
          dataQuality: "stale",
        },
      };
    }
    case "VESSEL_CHANGE_ORION":
      return {
        ...base,
        ...overrides,
        id: "mmsi:244999888",
        name: "MV Orion",
        mmsi: "244999888",
        imo: "9555123",
        position: { latitude: 51.9, longitude: 4.4 },
      };
    default:
      return { ...base, ...overrides };
  }
}

/** In-memory fixture registry for VesselObservationService in tests. */
const fixtureByExecution = new Map<string, Vessel>();

export function setExecutionAisFixture(
  executionId: string,
  vessel: Vessel | null,
): void {
  if (!vessel) fixtureByExecution.delete(executionId);
  else fixtureByExecution.set(executionId, vessel);
}

export function getExecutionAisFixture(
  executionId: string,
): Vessel | undefined {
  return fixtureByExecution.get(executionId);
}

export function resetAisFixturesForTests(): void {
  fixtureByExecution.clear();
}
