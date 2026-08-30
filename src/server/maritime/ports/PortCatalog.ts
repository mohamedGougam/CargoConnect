import type { Port } from "@/domain/models";
import catalogJson from "@/data/ports/catalog.eastern-med.json";

export interface PortCatalogFile {
  version: number;
  generatedAt: string;
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  sources: string[];
  disclaimer: string;
  ports: Port[];
}

const catalog = catalogJson as PortCatalogFile;

export function getPortCatalog(): PortCatalogFile {
  return catalog;
}

export function listCatalogPorts(filter?: {
  minLat?: number;
  minLon?: number;
  maxLat?: number;
  maxLon?: number;
}): Port[] {
  const ports = catalog.ports;
  if (
    filter?.minLat === undefined ||
    filter?.maxLat === undefined ||
    filter?.minLon === undefined ||
    filter?.maxLon === undefined
  ) {
    return ports;
  }
  return ports.filter(
    (p) =>
      p.position.latitude >= filter.minLat! &&
      p.position.latitude <= filter.maxLat! &&
      p.position.longitude >= filter.minLon! &&
      p.position.longitude <= filter.maxLon!,
  );
}

export function getCatalogPortById(id: string): Port | null {
  return catalog.ports.find((p) => p.id === id) ?? null;
}
