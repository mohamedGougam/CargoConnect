import type { Port } from "@/domain/models";
import type { DataSourceKind } from "@/domain/models/provenance";
import searchIndexJson from "@/data/ports/port-search-index.json";
import { SAMPLE_PORTS } from "@/data/providers/sample/sample-ports";

export interface SearchIndexPortRecord {
  id: string;
  canonicalName: string;
  aliases: string[];
  city: string;
  country: string;
  countryCode?: string;
  unlocode?: string;
  latitude: number;
  longitude: number;
  wpiNumber?: string;
  harborSize?: string;
  tier?: "major" | "secondary" | "local";
  sources: string[];
}

interface SearchIndexFile {
  version: number;
  kind?: string;
  ports: SearchIndexPortRecord[];
  stats?: {
    totalPorts?: number;
    totalCountries?: number;
  };
}

/**
 * Ports available for NL search resolution.
 * Primary: global WPI + UN/LOCODE search index.
 * SAMPLE_PORTS win on UN/LOCODE for commercial demo ID stability.
 */
export function getSearchPortIndex(): Port[] {
  const byId = new Map<string, Port>();
  const byUnlo = new Map<string, string>();

  const add = (port: Port, prefer = false) => {
    const code = port.unlocode?.toUpperCase();
    if (code && byUnlo.has(code) && !prefer) return;
    if (code && byUnlo.has(code) && prefer) {
      const oldId = byUnlo.get(code)!;
      const previous = byId.get(oldId);
      if (previous) {
        const previousMeta = previous.meta;
        const mergedAliases = Array.from(
          new Set([
            previous.name,
            ...(previousMeta?.aliases ?? []),
            ...(port.meta?.aliases ?? []),
          ]),
        ).filter(
          (a) => a && a.toLowerCase() !== port.name.toLowerCase(),
        );
        port = {
          ...port,
          wpiNumber: port.wpiNumber ?? previous.wpiNumber,
          specifications: {
            ...(previous.specifications ?? {}),
            ...(port.specifications ?? {}),
            harborSize:
              port.specifications?.harborSize ??
              previous.specifications?.harborSize,
          },
          meta: {
            sources: Array.from(
              new Set([
                ...(previousMeta?.sources ?? []),
                ...(port.meta?.sources ?? []),
              ]),
            ),
            aliases: mergedAliases.length ? mergedAliases : undefined,
            tier:
              port.meta?.tier ??
              previousMeta?.tier ??
              (prefer ? "major" : undefined),
          },
        };
      }
      if (oldId !== port.id) byId.delete(oldId);
    }
    byId.set(port.id, port);
    if (code) byUnlo.set(code, port.id);
  };

  const index = searchIndexJson as SearchIndexFile;
  for (const record of index.ports ?? []) {
    add(searchRecordToPort(record));
  }

  for (const port of SAMPLE_PORTS) {
    add(port, true);
  }

  // Ensure WPI/UNLOCODE aliases survive SAMPLE_PORTS id preference
  const aliasByUnlo = new Map<string, string[]>();
  for (const record of index.ports ?? []) {
    if (record.unlocode && record.aliases?.length) {
      aliasByUnlo.set(record.unlocode.toUpperCase(), record.aliases);
    }
  }
  for (const port of byId.values()) {
    const code = port.unlocode?.toUpperCase();
    if (!code || !aliasByUnlo.has(code)) continue;
    const fromIndex = aliasByUnlo.get(code)!;
    const merged = Array.from(
      new Set([...(port.meta?.aliases ?? []), ...fromIndex]),
    );
    port.meta = {
      ...(port.meta ?? { sources: ["NGA_WPI"] }),
      aliases: merged,
    };
  }

  return Array.from(byId.values());
}

function searchRecordToPort(record: SearchIndexPortRecord): Port {
  const sources = (record.sources ?? []).filter(Boolean) as DataSourceKind[];
  return {
    id: record.id,
    name: record.canonicalName,
    country: record.country,
    locationLabel: `${record.city}, ${record.country}`,
    type: "seaport",
    position: {
      latitude: record.latitude,
      longitude: record.longitude,
    },
    unlocode: record.unlocode,
    wpiNumber: record.wpiNumber,
    specifications: {
      harborSize: record.harborSize,
    },
    meta: {
      sources: sources.length ? sources : ["NGA_WPI"],
      tier: record.tier,
      aliases: record.aliases?.length ? record.aliases : undefined,
    },
  };
}
