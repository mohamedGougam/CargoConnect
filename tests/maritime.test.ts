import { describe, expect, it } from "vitest";
import { parseAisStreamMessage } from "@/server/maritime/ais/parseMessage";
import {
  applyPositionUpdate,
  applyStaticUpdate,
  parseAisEta,
} from "@/server/maritime/ais/mergeVesselState";
import { vesselStateToUiVessel } from "@/server/maritime/ais/toUiVessel";
import { createEmptyVesselState } from "@/server/maritime/ais/vesselState";
import { InMemoryVesselStateStore } from "@/server/maritime/store/VesselStateStore";
import { normalizeAisShipType } from "@/server/maritime/normalize/vesselType";
import {
  classifyFreshness,
  FRESHNESS_LIVE_MAX_MS,
  FRESHNESS_STALE_MAX_MS,
} from "@/server/maritime/normalize/freshness";
import { normalizeDestinationRaw } from "@/server/maritime/normalize/destination";
import {
  normalizeWpiRow,
  parseUnlocodeCoordinates,
  mergePortRecords,
} from "@/server/maritime/ports/normalizePorts";
import {
  createMaritimeDataProvider,
  resetMaritimeDataProviderCache,
  resolveProviderKind,
} from "@/data/providers";

describe("AIS message normalization", () => {
  it("parses PositionReport", () => {
    const parsed = parseAisStreamMessage({
      MessageType: "PositionReport",
      MetaData: { MMSI: 241000001, ShipName: "TEST SHIP", Latitude: 37.9, Longitude: 23.6 },
      Message: {
        PositionReport: {
          UserID: 241000001,
          Latitude: 37.9,
          Longitude: 23.6,
          Sog: 12.5,
          Cog: 180,
          TrueHeading: 175,
          NavigationalStatus: 0,
        },
      },
    });
    expect(parsed.kind).toBe("position");
    if (parsed.kind === "position") {
      expect(parsed.update.mmsi).toBe("241000001");
      expect(parsed.update.latitude).toBe(37.9);
      expect(parsed.update.sog).toBe(12.5);
    }
  });

  it("parses ShipStaticData", () => {
    const parsed = parseAisStreamMessage({
      MessageType: "ShipStaticData",
      MetaData: { MMSI: 241000001 },
      Message: {
        ShipStaticData: {
          UserID: 241000001,
          Name: "AEGEAN STAR@@@@",
          ImoNumber: 9123456,
          CallSign: "SVA123",
          Type: 70,
          Destination: "PIRAEUS@@@@@@@@",
          MaximumStaticDraught: 8.2,
          Dimension: { A: 100, B: 20, C: 8, D: 8 },
          Eta: { Month: 9, Day: 15, Hour: 12, Minute: 30 },
        },
      },
    });
    expect(parsed.kind).toBe("static");
    if (parsed.kind === "static") {
      expect(parsed.update.name).toContain("AEGEAN");
      expect(parsed.update.aisShipType).toBe(70);
    }
  });

  it("rejects invalid coordinates", () => {
    const parsed = parseAisStreamMessage({
      MessageType: "PositionReport",
      Message: {
        PositionReport: {
          UserID: 241000001,
          Latitude: 91,
          Longitude: 23.6,
          Sog: 1,
        },
      },
    });
    expect(parsed.kind).toBe("ignore");
  });

  it("rejects empty MMSI", () => {
    const parsed = parseAisStreamMessage({
      MessageType: "PositionReport",
      Message: {
        PositionReport: {
          UserID: 0,
          Latitude: 37,
          Longitude: 23,
        },
      },
    });
    expect(parsed.kind).toBe("ignore");
  });
});

describe("MMSI state merging", () => {
  it("merges position then static without dropping fields", () => {
    const store = new InMemoryVesselStateStore();
    const pos = applyPositionUpdate(undefined, {
      mmsi: "241000001",
      latitude: 37.5,
      longitude: 23.5,
      sog: 10,
      cog: 90,
      receivedAt: "2026-08-29T12:00:00.000Z",
    });
    expect(pos).not.toBeNull();
    store.upsert(pos!);

    const merged = applyStaticUpdate(store.get("241000001"), {
      mmsi: "241000001",
      name: "TEST VESSEL",
      imo: "9123456",
      aisShipType: 80,
      destination: "ALEXANDRIA",
      draught: 9,
      dimension: { a: 120, b: 30, c: 10, d: 10 },
      receivedAt: "2026-08-29T12:05:00.000Z",
    });
    store.upsert(merged);

    const state = store.get("241000001")!;
    expect(state.latitude).toBe(37.5);
    expect(state.speedOverGround).toBe(10);
    expect(state.name).toBe("TEST VESSEL");
    expect(state.normalizedVesselType).toBe("tanker");
    expect(state.lengthMeters).toBe(150);
    expect(state.destinationRaw).toBe("ALEXANDRIA");

    const laterPos = applyPositionUpdate(state, {
      mmsi: "241000001",
      latitude: 37.6,
      longitude: 23.7,
      sog: 11,
      receivedAt: "2026-08-29T12:10:00.000Z",
    });
    expect(laterPos!.name).toBe("TEST VESSEL");
    expect(laterPos!.imo).toBe("9123456");
    expect(laterPos!.latitude).toBe(37.6);
  });

  it("maps to UI vessel", () => {
    let state = createEmptyVesselState("241000001");
    state = applyPositionUpdate(state, {
      mmsi: "241000001",
      latitude: 37.5,
      longitude: 23.5,
      sog: 8,
      navStatus: 0,
      receivedAt: new Date().toISOString(),
    })!;
    state = applyStaticUpdate(state, {
      mmsi: "241000001",
      name: "UI TEST",
      aisShipType: 70,
      receivedAt: new Date().toISOString(),
    });
    const ui = vesselStateToUiVessel(state)!;
    expect(ui.id).toBe("mmsi:241000001");
    expect(ui.name).toBe("UI TEST");
    expect(ui.meta?.source).toBe("AISSTREAM");
    expect(ui.meta?.freshness).toBe("live");
  });
});

describe("vessel type normalization", () => {
  it("maps AIS codes deterministically without inventing container/bulk", () => {
    expect(normalizeAisShipType(70)).toBe("general_cargo");
    expect(normalizeAisShipType(80)).toBe("tanker");
    expect(normalizeAisShipType(60)).toBe("passenger");
    expect(normalizeAisShipType(30)).toBe("fishing");
    expect(normalizeAisShipType(37)).toBe("pleasure");
    expect(normalizeAisShipType(52)).toBe("tug_service");
    expect(normalizeAisShipType(undefined)).toBe("unknown");
    expect(normalizeAisShipType(99)).toBe("other");
  });
});

describe("freshness", () => {
  it("classifies live / stale / very_stale", () => {
    const now = Date.UTC(2026, 7, 29, 12, 0, 0);
    expect(
      classifyFreshness(new Date(now - 5 * 60 * 1000).toISOString(), now),
    ).toBe("live");
    expect(
      classifyFreshness(
        new Date(now - FRESHNESS_LIVE_MAX_MS - 1000).toISOString(),
        now,
      ),
    ).toBe("stale");
    expect(
      classifyFreshness(
        new Date(now - FRESHNESS_STALE_MAX_MS - 1000).toISOString(),
        now,
      ),
    ).toBe("very_stale");
  });
});

describe("destination + ETA", () => {
  it("cleans destination without inventing ports", () => {
    expect(normalizeDestinationRaw("PIRAEUS@@@@@@@@")).toBe("PIRAEUS");
    expect(normalizeDestinationRaw("@@@")).toBeUndefined();
    expect(normalizeDestinationRaw("N/A")).toBeUndefined();
  });

  it("rejects invalid ETA components", () => {
    expect(
      parseAisEta({ month: 0, day: 1, hour: 12, minute: 0 }, "2026-08-29T12:00:00.000Z"),
    ).toBeUndefined();
    expect(
      parseAisEta({ month: 9, day: 15, hour: 12, minute: 0 }, "2026-08-29T12:00:00.000Z"),
    ).toMatch(/^2026-09-15/);
  });
});

describe("formatEta", () => {
  it("returns undefined for invalid dates", async () => {
    const { formatEta } = await import("@/lib/format");
    expect(formatEta(undefined)).toBeUndefined();
    expect(formatEta("not-a-date")).toBeUndefined();
  });
});

describe("port normalization", () => {
  it("normalizes WPI rows", () => {
    const port = normalizeWpiRow({
      "World Port Index Number": "43760",
      "Main Port Name": "PIRAEUS",
      "UN/LOCODE": "GRPIR",
      "Country Code": "GR",
      "Region Name": "Mediterranean - Eastern",
      Latitude: 37.948,
      Longitude: 23.643,
      "Facilities - Container": "Yes",
      "Channel Depth (m)": 16,
      "Cargo Pier Depth (m)": 18.5,
    });
    expect(port).not.toBeNull();
    expect(port!.unlocode).toBe("GRPIR");
    expect(port!.type).toBe("container_terminal");
    expect(port!.meta?.sources).toContain("NGA_WPI");
    expect(port!.capabilities?.cargoTypes).toContain("Containers");
  });

  it("parses UN/LOCODE coordinates", () => {
    expect(parseUnlocodeCoordinates("3745N 02338E")).toEqual({
      latitude: 37 + 45 / 60,
      longitude: 23 + 38 / 60,
    });
  });

  it("merges provenance", () => {
    const wpi = normalizeWpiRow({
      "Main Port Name": "PIRAEUS",
      "UN/LOCODE": "GRPIR",
      "Country Code": "GR",
      Latitude: 37.9,
      Longitude: 23.6,
    })!;
    const merged = mergePortRecords(wpi, {
      unlocode: "GRPIR",
      meta: { sources: ["UN_LOCODE"] },
    });
    expect(merged.meta?.sources).toEqual(expect.arrayContaining(["NGA_WPI", "UN_LOCODE"]));
  });
});

describe("provider selection", () => {
  it("defaults to sample", () => {
    resetMaritimeDataProviderCache();
    const prev = process.env.NEXT_PUBLIC_MARITIME_DATA_MODE;
    delete process.env.NEXT_PUBLIC_MARITIME_DATA_MODE;
    delete process.env.NEXT_PUBLIC_DATA_PROVIDER;
    expect(resolveProviderKind()).toBe("sample");
    const provider = createMaritimeDataProvider("sample");
    expect(provider.isDemonstrationData).toBe(true);
    expect(provider.statusLabel).toContain("Demonstration");
    process.env.NEXT_PUBLIC_MARITIME_DATA_MODE = prev;
  });
});

describe("API serialization shape", () => {
  it("UI vessel JSON omits secrets and raw AIS envelopes", () => {
    let state = createEmptyVesselState("241000001");
    state = applyPositionUpdate(state, {
      mmsi: "241000001",
      latitude: 37.5,
      longitude: 23.5,
      receivedAt: new Date().toISOString(),
    })!;
    const ui = vesselStateToUiVessel(state)!;
    const json = JSON.stringify(ui);
    expect(json).not.toContain("APIKey");
    expect(json).not.toContain("PositionReport");
    expect(JSON.parse(json).mmsi).toBe("241000001");
  });
});
