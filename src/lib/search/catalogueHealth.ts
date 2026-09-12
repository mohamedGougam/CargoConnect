import searchIndexJson from "@/data/ports/port-search-index.json";

/** Guard countries — presence detects accidental fixture deployment. */
export const CATALOGUE_GUARD_COUNTRIES = [
  "Netherlands",
  "Norway",
  "Tunisia",
  "Algeria",
  "Morocco",
  "Egypt",
  "Greece",
  "Spain",
  "Germany",
  "United States",
  "Brazil",
  "South Africa",
  "United Arab Emirates",
  "India",
  "Singapore",
  "Malaysia",
  "China",
  "Japan",
  "Australia",
] as const;

const MIN_RUNTIME_PORTS = 500;
const MIN_RUNTIME_COUNTRIES = 40;

export interface PortCatalogueDiagnostics {
  kind: string;
  generatedAt?: string;
  totalPorts: number;
  totalCountries: number;
  portsWithCoordinates: number;
  portsWithUNLocode: number;
  wpiSourceRows?: number;
  unlocodeSourceRows?: number;
  wpiOnlyRecords?: number;
  unlocodeOnlyRecords?: number;
  mergedRecords?: number;
  guardCountriesPresent: string[];
  guardCountriesMissing: string[];
  incomplete: boolean;
  code?: "PORT_CATALOGUE_INCOMPLETE";
  message?: string;
}

interface IndexShape {
  kind?: string;
  generatedAt?: string;
  portCount?: number;
  stats?: Partial<PortCatalogueDiagnostics>;
  ports?: Array<{
    country?: string;
    unlocode?: string;
    latitude?: number;
    longitude?: number;
    sources?: string[];
  }>;
}

export function getPortCatalogueDiagnostics(): PortCatalogueDiagnostics {
  const index = searchIndexJson as IndexShape;
  const ports = index.ports ?? [];
  const countries = new Set(
    ports.map((p) => p.country).filter((c): c is string => Boolean(c)),
  );
  const stats = index.stats ?? {};
  const totalPorts = stats.totalPorts ?? index.portCount ?? ports.length;
  const totalCountries = stats.totalCountries ?? countries.size;
  const portsWithCoordinates =
    stats.portsWithCoordinates ??
    ports.filter(
      (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
    ).length;
  const portsWithUNLocode =
    stats.portsWithUNLocode ?? ports.filter((p) => Boolean(p.unlocode)).length;

  const present: string[] = [];
  const missing: string[] = [];
  for (const name of CATALOGUE_GUARD_COUNTRIES) {
    if (countries.has(name)) present.push(name);
    else missing.push(name);
  }

  const kind = index.kind ?? "unknown";
  const incomplete =
    kind === "fixture" ||
    totalPorts < MIN_RUNTIME_PORTS ||
    totalCountries < MIN_RUNTIME_COUNTRIES ||
    missing.length > 0;

  return {
    kind,
    generatedAt: index.generatedAt,
    totalPorts,
    totalCountries,
    portsWithCoordinates,
    portsWithUNLocode,
    wpiSourceRows: stats.wpiSourceRows,
    unlocodeSourceRows: stats.unlocodeSourceRows,
    wpiOnlyRecords: stats.wpiOnlyRecords,
    unlocodeOnlyRecords: stats.unlocodeOnlyRecords,
    mergedRecords: stats.mergedRecords,
    guardCountriesPresent: present,
    guardCountriesMissing: missing,
    incomplete,
    ...(incomplete
      ? {
          code: "PORT_CATALOGUE_INCOMPLETE" as const,
          message: `Port catalogue looks incomplete (ports=${totalPorts}, countries=${totalCountries}, kind=${kind}). Runtime must ship the generated global index, not fixtures.`,
        }
      : {}),
  };
}
