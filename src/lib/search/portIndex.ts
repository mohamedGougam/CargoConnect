import type { Port } from "@/domain/models";
import { SAMPLE_PORTS } from "@/data/providers/sample/sample-ports";
import easternMedJson from "@/data/ports/catalog.eastern-med.json";
import globalMajorsJson from "@/data/ports/catalog.global-majors.json";

/**
 * Ports available for NL search resolution.
 * Prefer sample hub IDs (demo continuity), then catalogs.
 */
export function getSearchPortIndex(): Port[] {
  const byId = new Map<string, Port>();
  const byUnlo = new Map<string, string>();

  const add = (port: Port, prefer = false) => {
    const code = port.unlocode?.toUpperCase();
    if (code && byUnlo.has(code) && !prefer) {
      // Keep existing id for this UN/LOCODE
      return;
    }
    if (code && byUnlo.has(code) && prefer) {
      const oldId = byUnlo.get(code)!;
      if (oldId !== port.id) byId.delete(oldId);
    }
    byId.set(port.id, port);
    if (code) byUnlo.set(code, port.id);
  };

  for (const port of (easternMedJson as { ports: Port[] }).ports ?? []) {
    add(port);
  }
  for (const port of (globalMajorsJson as { ports: Port[] }).ports ?? []) {
    add(port);
  }
  // Sample hubs win on UN/LOCODE so commercial fixtures keep stable ids
  for (const port of SAMPLE_PORTS) {
    add(port, true);
  }

  return Array.from(byId.values());
}
