import { describe, expect, it } from "vitest";
import { getPortCatalogueDiagnostics } from "@/lib/search/catalogueHealth";
import { getSearchPortIndex } from "@/lib/search/portIndex";
import { resolveLocation } from "@/lib/search/resolvePorts";
import { runMaritimeRouteSearch } from "@/lib/search/runSearch";

describe("global port catalogue (runtime index)", () => {
  const ports = getSearchPortIndex();
  const diag = getPortCatalogueDiagnostics();

  it("ships a global runtime catalogue, not fixtures", () => {
    expect(diag.kind).toBe("runtime_global");
    expect(diag.incomplete).toBe(false);
    expect(diag.totalPorts).toBeGreaterThanOrEqual(500);
    expect(diag.totalCountries).toBeGreaterThanOrEqual(40);
    expect(diag.guardCountriesMissing).toEqual([]);
  });

  it.each([
    ["Tunis", /Tunis/i, /Tunisia/i],
    ["Casablanca", /Casablanca/i, /Morocco/i],
    ["Algiers", /Alger/i, /Algeria/i],
    ["Rotterdam", /Rotterdam/i, /Netherlands/i],
    ["Oslo", /Oslo/i, /Norway/i],
    ["Hamburg", /Hamburg/i, /Germany/i],
    ["Piraeus", /Piraeus/i, /Greece/i],
    ["Alexandria", /Alexandria/i, /Egypt/i],
    ["Jebel Ali", /Jebel Ali/i, /United Arab Emirates/i],
    ["Singapore", /Singapore/i, /Singapore/i],
    ["Port Klang", /Port Klang|Kelang/i, /Malaysia/i],
    ["Shanghai", /Shanghai/i, /China/i],
    ["Busan", /Busan|Pusan/i, /Korea/i],
    ["Sydney", /Sydney/i, /Australia/i],
    ["Cape Town", /Cape Town/i, /South Africa/i],
    ["Santos", /Santos/i, /Brazil/i],
  ] as const)("resolves %s from catalogue", (query, nameRe, countryRe) => {
    const r = resolveLocation(query, ports);
    expect(r.best?.port.name).toMatch(nameRe);
    expect(r.best?.port.country).toMatch(countryRe);
    expect(r.ambiguous).toBe(false);
  });

  it("resolves Mumbai / Nhava Sheva region from catalogue", () => {
    const mumbai = resolveLocation("Mumbai", ports);
    const nhava = resolveLocation("Nhava Sheva", ports);
    const hit = mumbai.best ?? nhava.best ?? mumbai.candidates[0] ?? nhava.candidates[0];
    expect(hit?.port.country).toMatch(/India/i);
    expect(hit?.port.name).toBeTruthy();
  });

  it("resolves Tokyo / Yokohama region from catalogue", () => {
    const tokyo = resolveLocation("Tokyo", ports);
    const yoko = resolveLocation("Yokohama", ports);
    const hit = tokyo.best ?? yoko.best ?? tokyo.candidates[0] ?? yoko.candidates[0];
    expect(hit?.port.country).toMatch(/Japan/i);
  });

  it("resolves New York / New Jersey region from catalogue", () => {
    const ny = resolveLocation("New York", ports);
    const nj = resolveLocation("Newark", ports);
    const hit = ny.best ?? nj.best ?? ny.candidates[0] ?? nj.candidates[0];
    expect(hit?.port.country).toMatch(/United States/i);
  });

  it("resolves Los Angeles / Long Beach region from catalogue", () => {
    const la = resolveLocation("Los Angeles", ports);
    const lb = resolveLocation("Long Beach", ports);
    const hit = la.best ?? lb.best ?? la.candidates[0] ?? lb.candidates[0];
    expect(hit?.port.country).toMatch(/United States/i);
  });

  it("tunis to malaysia: Tunis origin + Malaysian destinations + auto-select", async () => {
    const result = await runMaritimeRouteSearch({
      query: "tunis to malaysia",
      vessels: [],
      deterministicOnly: true,
    });
    expect(result.status).toBe("active");
    expect(result.origin?.name).toMatch(/Tunis/i);
    expect(result.origin?.country).toMatch(/Tunisia/i);
    expect(result.destination?.country).toMatch(/Malaysia/i);
    expect(result.destinationSelectionReason).toBe("shortest_maritime_distance");
    expect(result.destinationOptions?.length).toBeGreaterThan(1);
    expect(
      result.destinationOptions?.every((o) => o.port.country === "Malaysia"),
    ).toBe(true);
    expect(result.destination?.id).toBe(result.destinationOptions![0].port.id);
  });
});
