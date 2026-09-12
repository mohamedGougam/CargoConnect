import type { Port } from "@/domain/models";
import { SAMPLE_PORTS } from "@/data/providers/sample/sample-ports";
import catalogJson from "@/data/ports/catalog.eastern-med.json";

/**
 * Ports available for NL search resolution.
 * Merges Eastern Med catalog + sample major hubs (e.g. Rotterdam).
 */
export function getSearchPortIndex(): Port[] {
  const catalogPorts = (catalogJson as { ports: Port[] }).ports;
  const byId = new Map<string, Port>();
  for (const port of catalogPorts) {
    byId.set(port.id, port);
  }
  for (const port of SAMPLE_PORTS) {
    if (!byId.has(port.id)) byId.set(port.id, port);
  }

  const byUnlo = new Map<string, Port>();
  for (const port of byId.values()) {
    if (port.unlocode && !byUnlo.has(port.unlocode)) {
      byUnlo.set(port.unlocode, port);
    }
  }

  const result: Port[] = [];
  const seen = new Set<string>();
  for (const port of byId.values()) {
    if (port.unlocode && byUnlo.get(port.unlocode)?.id !== port.id) continue;
    if (seen.has(port.id)) continue;
    seen.add(port.id);
    result.push(port);
  }
  return result;
}
