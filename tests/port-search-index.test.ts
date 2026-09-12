import { describe, expect, it } from "vitest";
import { getSearchPortIndex } from "@/lib/search/portIndex";
import { resolveLocation } from "@/lib/search/resolvePorts";
import { CITY_SERVING_PORTS } from "@/lib/search/cityServingPorts";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";
import searchIndex from "@/data/ports/port-search-index.json";

describe("global port search index coverage", () => {
  const ports = getSearchPortIndex();

  it("loads WPI/UNLOCODE-backed ports", () => {
    expect(searchIndex.portCount).toBeGreaterThan(40);
    expect(ports.length).toBeGreaterThan(40);
    const countries = new Set(ports.map((p) => p.country));
    expect(countries.size).toBeGreaterThan(15);
  });

  it("has no invalid coordinates in search index", () => {
    for (const p of searchIndex.ports) {
      expect(Number.isFinite(p.latitude)).toBe(true);
      expect(Number.isFinite(p.longitude)).toBe(true);
      expect(Math.abs(p.latitude)).toBeLessThanOrEqual(90);
      expect(Math.abs(p.longitude)).toBeLessThanOrEqual(180);
    }
  });

  it("fails CI if city serving maps cross country", () => {
    for (const [city, rule] of Object.entries(CITY_SERVING_PORTS)) {
      for (const code of rule.servingUnlocodes) {
        expect(code.slice(0, 2).toUpperCase()).toBe(rule.countryCode);
        const port = ports.find((p) => p.unlocode?.toUpperCase() === code);
        if (port?.unlocode) {
          expect(port.unlocode.slice(0, 2).toUpperCase()).toBe(rule.countryCode);
        }
      }
      // Resolver must not return a different-country port for this city
      const res = resolveLocation(city, ports);
      for (const c of res.candidates) {
        expect(c.port.unlocode?.slice(0, 2).toUpperCase()).toBe(
          rule.countryCode,
        );
      }
    }
  });

  it("country queries only return ports in that country", () => {
    for (const country of ["Norway", "Malaysia", "Egypt", "Spain", "India"]) {
      const res = resolveLocation(country, ports);
      expect(res.candidates.length).toBeGreaterThan(0);
      for (const c of res.candidates) {
        expect(c.port.country.toLowerCase()).toContain(
          country === "United States" ? "united" : country.toLowerCase().slice(0, 5),
        );
        expect(c.confidence).toBe("LOW");
      }
    }
  });
});

describe("route resolution regressions (catalogue)", () => {
  const ports = getSearchPortIndex();

  it.each([
    ["Barcelona", "Algiers", /Barcelona/i, /Algiers/i, "active"],
    ["Hamburg", "Alexandria", /Hamburg/i, /Alexandria/i, "active"],
    ["Antwerp", "Alexandria", /Antwerp/i, /Alexandria/i, "active"],
    ["Piraeus", "Alexandria", /Piraeus/i, /Alexandria/i, "active"],
    ["Shanghai", "Los Angeles", /Shanghai/i, /Los Angeles/i, "active"],
    ["New York", "Rotterdam", /New York/i, /Rotterdam/i, "active"],
  ] as const)(
    "%s → %s resolves",
    async (origin, dest, oRe, dRe, status) => {
      const result = await runMaritimeRouteSearch({
        query: `${origin} to ${dest}`,
        vessels: [],
        deterministicOnly: true,
      });
      expect(result.status).toBe(status);
      expect(result.origin?.name).toMatch(oRe);
      expect(result.destination?.name).toMatch(dRe);
    },
  );

  it("Amsterdam → Norway: origin auto, nearest Norwegian destination selected", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Amsterdam to Norway",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.origin?.name).toMatch(/Amsterdam/i);
    expect(result.status).toBe("active");
    expect(result.resolutionOutcome).toBe("candidates");
    const dest = result.destinationOptions ?? [];
    expect(dest.length).toBeGreaterThan(0);
    expect(dest.every((c) => c.port.country === "Norway")).toBe(true);
    expect(dest.some((c) => /Oslo/i.test(c.port.name))).toBe(true);
    expect(result.destination?.id).toBe(dest[0].port.id);
  });

  it("Athens → Egypt: Piraeus serving + Egyptian destination auto-selected", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Athens to Egypt",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.origin?.name).toMatch(/Piraeus/i);
    expect(result.status).toBe("active");
    expect(result.destination?.country).toBe("Egypt");
    expect(
      result.destinationOptions?.every((c) => c.port.country === "Egypt"),
    ).toBe(true);
  });

  it("Singapore → Malaysia: destination candidates stay in Malaysia and auto-select", async () => {
    const result = await runMaritimeRouteSearch({
      query: "Singapore to Malaysia",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.origin?.name).toMatch(/Singapore/i);
    expect(result.status).toBe("active");
    expect(
      result.destinationOptions?.every((c) => c.port.country === "Malaysia"),
    ).toBe(true);
  });

  it("Dubai → India: serving ports in UAE, India candidates only", async () => {
    const dubai = resolveLocation("Dubai", ports);
    expect(dubai.candidates.every((c) => c.port.country === "United Arab Emirates")).toBe(
      true,
    );
    const result = await runMaritimeRouteSearch({
      query: "Dubai to India",
      vessels: [],
      deterministicOnly: true,
    });
    // Dubai may resolve as serving-port candidates (ambiguous origin) or auto hub
    if (result.status === "active") {
      expect(
        result.destinationOptions?.every((c) => c.port.country === "India") ||
          result.destination?.country === "India",
      ).toBe(true);
    } else {
      expect(result.status).toBe("ambiguous");
      expect(
        result.destinationCandidates?.every((c) => c.port.country === "India"),
      ).toBe(true);
    }
  });
});

describe("multilingual resolution regressions", () => {
  it.each([
    ["De Barcelona a Argel", /Barcelona/i, /Algiers/i],
    ["Von Hamburg nach Alexandria", /Hamburg/i, /Alexandria/i],
    ["Van Antwerpen naar Alexandrië", /Antwerp/i, /Alexandria/i],
    ["Από τον Πειραιά στην Αλεξάνδρεια", /Piraeus/i, /Alexandria/i],
  ] as const)("%s", async (query, oRe, dRe) => {
    const result = await runMaritimeRouteSearch({
      query,
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(oRe);
    expect(result.destination?.name).toMatch(dRe);
  });
});
