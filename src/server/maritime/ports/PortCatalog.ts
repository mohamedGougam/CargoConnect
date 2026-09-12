import type { DataSourceKind, Port } from "@/domain/models";
import easternMedJson from "@/data/ports/catalog.eastern-med.json";
import globalMajorsJson from "@/data/ports/catalog.global-majors.json";

export interface PortCatalogFile {
  version: number;
  generatedAt: string;
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  sources: string[];
  disclaimer: string;
  ports: Port[];
}

const easternMed = easternMedJson as PortCatalogFile;
const globalMajors = globalMajorsJson as PortCatalogFile;

let mergedCache: Port[] | null = null;

function mergeCatalogs(): Port[] {
  if (mergedCache) return mergedCache;
  const byId = new Map<string, Port>();

  for (const p of easternMed.ports) {
    byId.set(p.id, {
      ...p,
      meta: {
        sources: p.meta?.sources ?? ["NGA_WPI"],
        importedAt: p.meta?.importedAt,
        tier: p.meta?.tier ?? inferTier(p),
      },
    });
  }

  for (const p of globalMajors.ports) {
    const existing = byId.get(p.id);
    if (!existing) {
      byId.set(p.id, {
        ...p,
        meta: {
          sources: (p.meta?.sources ?? ["CURATED_MAJOR"]) as DataSourceKind[],
          importedAt: p.meta?.importedAt,
          tier: p.meta?.tier ?? "major",
        },
      });
      continue;
    }
    const sources = Array.from(
      new Set<DataSourceKind>([
        ...(existing.meta?.sources ?? []),
        ...((p.meta?.sources ?? ["CURATED_MAJOR"]) as DataSourceKind[]),
      ]),
    );
    byId.set(p.id, {
      ...existing,
      unlocode: existing.unlocode ?? p.unlocode,
      meta: {
        sources,
        importedAt: existing.meta?.importedAt ?? p.meta?.importedAt,
        tier: existing.meta?.tier ?? p.meta?.tier ?? "major",
      },
    });
  }

  // Match by UN/LOCODE when ids differ (e.g. WPI vs curated)
  const byUnlocode = new Map<string, string>();
  for (const [id, p] of byId) {
    if (p.unlocode) byUnlocode.set(p.unlocode.toUpperCase(), id);
  }
  for (const p of globalMajors.ports) {
    const code = p.unlocode?.toUpperCase();
    if (!code) continue;
    const existingId = byUnlocode.get(code);
    if (!existingId || existingId === p.id) continue;
    const existing = byId.get(existingId);
    if (!existing) continue;
    const sources = Array.from(
      new Set<DataSourceKind>([
        ...(existing.meta?.sources ?? []),
        ...((p.meta?.sources ?? ["CURATED_MAJOR"]) as DataSourceKind[]),
      ]),
    );
    byId.set(existingId, {
      ...existing,
      meta: {
        sources,
        importedAt: existing.meta?.importedAt,
        tier: "major",
      },
    });
  }

  mergedCache = Array.from(byId.values());
  return mergedCache;
}

export function getPortCatalog(): PortCatalogFile {
  return {
    version: Math.max(easternMed.version, globalMajors.version),
    generatedAt: new Date().toISOString(),
    bbox: { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 },
    sources: Array.from(
      new Set([...easternMed.sources, ...globalMajors.sources]),
    ),
    disclaimer: `${easternMed.disclaimer} ${globalMajors.disclaimer}`,
    ports: mergeCatalogs(),
  };
}

export function listCatalogPorts(filter?: {
  minLat?: number;
  minLon?: number;
  maxLat?: number;
  maxLon?: number;
  zoom?: number;
}): Port[] {
  let ports = mergeCatalogs();
  if (
    filter?.minLat !== undefined &&
    filter?.maxLat !== undefined &&
    filter?.minLon !== undefined &&
    filter?.maxLon !== undefined
  ) {
    const { minLat, maxLat, minLon, maxLon } = filter;
    const wraps = minLon > maxLon;
    ports = ports.filter((p) => {
      const { latitude: lat, longitude: lon } = p.position;
      if (lat < minLat || lat > maxLat) return false;
      if (!wraps) return lon >= minLon && lon <= maxLon;
      return lon >= minLon || lon <= maxLon;
    });
  }

  if (filter?.zoom !== undefined) {
    ports = filterPortsByZoom(ports, filter.zoom);
  }

  return ports;
}

export function filterPortsByZoom(ports: Port[], zoom: number): Port[] {
  if (zoom < 3.2) {
    return ports.filter((p) => (p.meta?.tier ?? inferTier(p)) === "major");
  }
  if (zoom < 5.5) {
    return ports.filter((p) => {
      const t = p.meta?.tier ?? inferTier(p);
      return t === "major" || t === "secondary";
    });
  }
  return ports;
}

function inferTier(p: Port): "major" | "secondary" | "local" {
  const size = p.specifications?.harborSize?.toUpperCase();
  if (size === "L" || size === "LARGE") return "major";
  if (size === "M" || size === "MEDIUM") return "secondary";
  if (p.meta?.sources?.includes("CURATED_MAJOR")) return "major";
  if (p.unlocode) return "secondary";
  return "local";
}

export function getCatalogPortById(id: string): Port | null {
  return mergeCatalogs().find((p) => p.id === id) ?? null;
}

export function resetPortCatalogCacheForTests(): void {
  mergedCache = null;
}
