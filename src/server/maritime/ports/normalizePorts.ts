import type { Port, PortType } from "@/domain/models";

/** Minimal WPI row shape we accept (matches NGA CSV headers). */
export interface WpiRow {
  "World Port Index Number"?: string | number;
  "Main Port Name"?: string;
  "Alternate Port Name"?: string;
  "UN/LOCODE"?: string;
  "Country Code"?: string;
  "Region Name"?: string;
  Latitude?: string | number;
  Longitude?: string | number;
  "Harbor Size"?: string;
  "Harbor Type"?: string;
  "Channel Depth (m)"?: string | number;
  "Anchorage Depth (m)"?: string | number;
  "Cargo Pier Depth (m)"?: string | number;
  "Facilities - Container"?: string;
  "Facilities - Solid Bulk"?: string;
  "Facilities - Oil Terminal"?: string;
  "Facilities - Liquid Bulk"?: string;
  "Facilities - Breakbulk"?: string;
  "Facilities - Ro-Ro"?: string;
  [key: string]: string | number | undefined;
}

export interface UnlocodeRow {
  Country?: string;
  Location?: string;
  Name?: string;
  NameWoDiacritics?: string;
  SubDiv?: string;
  Function?: string;
  Status?: string;
  Coordinates?: string;
  [key: string]: string | undefined;
}

const COUNTRY_NAMES: Record<string, string> = {
  GR: "Greece",
  TR: "Turkey",
  EG: "Egypt",
  CY: "Cyprus",
  IT: "Italy",
  MT: "Malta",
  LB: "Lebanon",
  IL: "Israel",
  SY: "Syria",
  LY: "Libya",
  TN: "Tunisia",
  DZ: "Algeria",
  ES: "Spain",
  FR: "France",
  HR: "Croatia",
  AL: "Albania",
  ME: "Montenegro",
  BA: "Bosnia and Herzegovina",
  SI: "Slovenia",
  NL: "Netherlands",
  DE: "Germany",
  BE: "Belgium",
  GB: "United Kingdom",
  US: "United States",
  SG: "Singapore",
  CN: "China",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  OM: "Oman",
  YE: "Yemen",
  DJ: "Djibouti",
  SO: "Somalia",
  ER: "Eritrea",
  SD: "Sudan",
};

export function countryNameFromCode(code: string | undefined): string {
  if (!code) return "Unknown";
  const c = code.trim().toUpperCase();
  return COUNTRY_NAMES[c] ?? c;
}

export function parseCoordinate(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim();
  const asNum = Number(s);
  if (Number.isFinite(asNum)) return asNum;
  // Degrees-minutes-seconds with symbols (legacy WPI)
  const dms = s.match(
    /(\d+)[^\d]+(\d+)[^\d]+([\d.]+)[^\d]*([NSEW])/i,
  );
  if (dms) {
    const deg = Number(dms[1]);
    const min = Number(dms[2]);
    const sec = Number(dms[3]);
    const hemi = dms[4].toUpperCase();
    let dec = deg + min / 60 + sec / 3600;
    if (hemi === "S" || hemi === "W") dec = -dec;
    return dec;
  }
  return undefined;
}

/** UN/LOCODE coordinates like "3745N 02338E" */
export function parseUnlocodeCoordinates(
  raw: string | undefined,
): { latitude: number; longitude: number } | undefined {
  if (!raw?.trim()) return undefined;
  const m = raw.trim().match(/^(\d{2})(\d{2})([NS])\s+(\d{3})(\d{2})([EW])$/i);
  if (!m) return undefined;
  // Groups: 1 lat deg, 2 lat min, 3 N/S, 4 lon deg, 5 lon min, 6 E/W
  let lat = Number(m[1]) + Number(m[2]) / 60;
  let lon = Number(m[4]) + Number(m[5]) / 60;
  if (m[3].toUpperCase() === "S") lat = -lat;
  if (m[6].toUpperCase() === "W") lon = -lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  return { latitude: lat, longitude: lon };
}

export function inferPortTypeFromWpi(row: WpiRow): PortType {
  const yes = (key: string) => String(row[key] ?? "").toLowerCase() === "yes";
  if (yes("Facilities - Container")) return "container_terminal";
  if (yes("Facilities - Oil Terminal") || yes("Facilities - Liquid Bulk")) {
    return "oil_terminal";
  }
  if (yes("Facilities - Solid Bulk")) return "bulk_terminal";
  if (yes("Facilities - Ro-Ro") && yes("Facilities - Breakbulk")) return "multipurpose";
  return "seaport";
}

export function cargoTypesFromWpi(row: WpiRow): string[] | undefined {
  const types: string[] = [];
  const add = (key: string, label: string) => {
    if (String(row[key] ?? "").toLowerCase() === "yes") types.push(label);
  };
  add("Facilities - Container", "Containers");
  add("Facilities - Solid Bulk", "Solid bulk");
  add("Facilities - Liquid Bulk", "Liquid bulk");
  add("Facilities - Oil Terminal", "Oil");
  add("Facilities - Breakbulk", "Breakbulk");
  add("Facilities - Ro-Ro", "Ro-Ro");
  add("Facilities - LNG Terminal", "LNG");
  return types.length > 0 ? types : undefined;
}

export function normalizeWpiRow(row: WpiRow): Port | null {
  const name = String(row["Main Port Name"] ?? "").trim();
  if (!name) return null;

  const lat = parseCoordinate(row.Latitude);
  const lon = parseCoordinate(row.Longitude);
  if (lat === undefined || lon === undefined) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const countryCode = String(row["Country Code"] ?? "").trim().toUpperCase();
  const unlocode = String(row["UN/LOCODE"] ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const wpiNumber = String(row["World Port Index Number"] ?? "").trim();
  const id = unlocode
    ? `port-${unlocode.toLowerCase()}`
    : wpiNumber
      ? `port-wpi-${wpiNumber}`
      : `port-${name.toLowerCase().replace(/\s+/g, "-")}`;

  const region = String(row["Region Name"] ?? "").trim();
  const country = countryNameFromCode(countryCode);
  const channel = parseCoordinate(row["Channel Depth (m)"]);
  const anchorage = parseCoordinate(row["Anchorage Depth (m)"]);
  const pier = parseCoordinate(row["Cargo Pier Depth (m)"]);
  const cargoTypes = cargoTypesFromWpi(row);

  return {
    id,
    name: titleCasePort(name),
    country,
    locationLabel: region ? `${region}, ${country}` : country,
    type: inferPortTypeFromWpi(row),
    position: { latitude: lat, longitude: lon },
    unlocode: unlocode || undefined,
    wpiNumber: wpiNumber || undefined,
    specifications: {
      channelDepthMeters: channel,
      anchorageDepthMeters: anchorage,
      cargoPierDepthMeters: pier,
      maxDraftMeters: pier ?? channel,
      harborSize: String(row["Harbor Size"] ?? "").trim() || undefined,
      harborType: String(row["Harbor Type"] ?? "").trim() || undefined,
    },
    capabilities: cargoTypes
      ? { cargoTypes, canLoad: true, canUnload: true }
      : undefined,
    meta: {
      sources: ["NGA_WPI"],
    },
  };
}

export function normalizeUnlocodeRow(row: UnlocodeRow): Partial<Port> | null {
  const country = String(row.Country ?? "").trim().toUpperCase();
  const location = String(row.Location ?? "").trim().toUpperCase();
  if (!country || !location) return null;
  const unlocode = `${country}${location}`;
  const name = String(row.NameWoDiacritics ?? row.Name ?? "").trim();
  if (!name) return null;

  const coords = parseUnlocodeCoordinates(row.Coordinates);
  return {
    id: `port-${unlocode.toLowerCase()}`,
    name: titleCasePort(name),
    country: countryNameFromCode(country),
    locationLabel: countryNameFromCode(country),
    unlocode,
    position: coords,
    meta: { sources: ["UN_LOCODE"] },
  };
}

/**
 * Prefer WPI physical attributes; fill missing UN/LOCODE / name from UNLOCODE.
 * Does not invent facilities.
 */
export function mergePortRecords(wpi: Port, unlo?: Partial<Port> | null): Port {
  const sources = new Set([
    ...(wpi.meta?.sources ?? []),
    ...(unlo?.meta?.sources ?? []),
  ]);
  return {
    ...wpi,
    unlocode: wpi.unlocode || unlo?.unlocode,
    name: wpi.name || unlo?.name || wpi.name,
    country: wpi.country !== "Unknown" ? wpi.country : (unlo?.country ?? wpi.country),
    meta: {
      sources: Array.from(sources),
      importedAt: new Date().toISOString(),
    },
  };
}

function titleCasePort(name: string): string {
  return name
    .toLowerCase()
    .split(/(\s+)/)
    .map((part) =>
      /^\s+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}
