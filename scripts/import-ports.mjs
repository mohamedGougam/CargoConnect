/**
 * Build a normalized port catalog from WPI + UN/LOCODE CSV fixtures (or full dumps).
 *
 * Usage:
 *   node --experimental-strip-types scripts/import-ports.mts
 *   npm run import:ports
 *
 * Place full NGA WPI CSV at data/raw/UpdatedPub150.csv when available.
 * UNECE UN/LOCODE subset or full extract at data/raw/unlocode.csv (optional).
 *
 * Outputs: src/data/ports/catalog.eastern-med.json
 *
 * Licensing: WPI is a U.S. Government work (no NGA endorsement).
 * UN/LOCODE is redistributable per UNECE terms. Not for navigation.
 */
import { createReadStream, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const WPI_CANDIDATES = [
  path.join(root, "data/raw/UpdatedPub150.csv"),
  path.join(root, "data/fixtures/ports/wpi-eastern-med.fixture.csv"),
];
const UNLO_CANDIDATES = [
  path.join(root, "data/raw/unlocode.csv"),
  path.join(root, "data/fixtures/ports/unlocode-eastern-med.fixture.csv"),
];

const OUT = path.join(root, "src/data/ports/catalog.eastern-med.json");

/** Eastern Med bbox used for filtering full WPI dumps. */
const BBOX = { minLat: 30, maxLat: 42, minLon: 18, maxLon: 37 };

async function readCsv(filePath) {
  const lines = [];
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }) });
  for await (const line of rl) {
    lines.push(line);
  }
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function yes(row, key) {
  return String(row[key] ?? "").toLowerCase() === "yes";
}

function inferType(row) {
  if (yes(row, "Facilities - Container")) return "container_terminal";
  if (yes(row, "Facilities - Oil Terminal") || yes(row, "Facilities - Liquid Bulk")) {
    return "oil_terminal";
  }
  if (yes(row, "Facilities - Solid Bulk")) return "bulk_terminal";
  return "seaport";
}

function cargoTypes(row) {
  const types = [];
  const add = (k, label) => {
    if (yes(row, k)) types.push(label);
  };
  add("Facilities - Container", "Containers");
  add("Facilities - Solid Bulk", "Solid bulk");
  add("Facilities - Liquid Bulk", "Liquid bulk");
  add("Facilities - Oil Terminal", "Oil");
  add("Facilities - Breakbulk", "Breakbulk");
  add("Facilities - Ro-Ro", "Ro-Ro");
  return types.length ? types : undefined;
}

function titleCase(name) {
  return name
    .toLowerCase()
    .split(/(\s+)/)
    .map((p) => (/^\s+$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
}

const COUNTRY = {
  GR: "Greece",
  TR: "Turkey",
  EG: "Egypt",
  CY: "Cyprus",
  IT: "Italy",
  MT: "Malta",
  LB: "Lebanon",
  IL: "Israel",
  AL: "Albania",
  SY: "Syria",
  LY: "Libya",
  TN: "Tunisia",
};

function countryName(code) {
  const c = String(code ?? "").toUpperCase();
  return COUNTRY[c] ?? c ?? "Unknown";
}

function normalizeWpi(row) {
  const name = String(row["Main Port Name"] ?? "").trim();
  const lat = num(row.Latitude);
  const lon = num(row.Longitude);
  if (!name || lat === undefined || lon === undefined) return null;
  if (lat < BBOX.minLat || lat > BBOX.maxLat || lon < BBOX.minLon || lon > BBOX.maxLon) {
    return null;
  }
  const unlocode = String(row["UN/LOCODE"] ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const wpiNumber = String(row["World Port Index Number"] ?? "").trim();
  const countryCode = String(row["Country Code"] ?? "").trim().toUpperCase();
  const country = countryName(countryCode);
  const region = String(row["Region Name"] ?? "").trim();
  const channel = num(row["Channel Depth (m)"]);
  const pier = num(row["Cargo Pier Depth (m)"]);
  const types = cargoTypes(row);

  return {
    id: unlocode
      ? `port-${unlocode.toLowerCase()}`
      : `port-wpi-${wpiNumber || name.toLowerCase().replace(/\s+/g, "-")}`,
    name: titleCase(name),
    country,
    locationLabel: region ? `${region}, ${country}` : country,
    type: inferType(row),
    position: { latitude: lat, longitude: lon },
    unlocode: unlocode || undefined,
    wpiNumber: wpiNumber || undefined,
    specifications: {
      channelDepthMeters: channel,
      anchorageDepthMeters: num(row["Anchorage Depth (m)"]),
      cargoPierDepthMeters: pier,
      maxDraftMeters: pier ?? channel,
      harborSize: String(row["Harbor Size"] ?? "").trim() || undefined,
      harborType: String(row["Harbor Type"] ?? "").trim() || undefined,
    },
    capabilities: types ? { cargoTypes: types, canLoad: true, canUnload: true } : undefined,
    meta: { sources: ["NGA_WPI"], importedAt: new Date().toISOString() },
  };
}

function firstExisting(paths) {
  return paths.find((p) => existsSync(p));
}

async function main() {
  const wpiPath = firstExisting(WPI_CANDIDATES);
  if (!wpiPath) {
    console.error("No WPI CSV found. Place UpdatedPub150.csv or fixture under data/raw/");
    process.exit(1);
  }
  const unloPath = firstExisting(UNLO_CANDIDATES);

  console.log("WPI source:", wpiPath);
  if (unloPath) console.log("UN/LOCODE source:", unloPath);

  const wpiRows = await readCsv(wpiPath);
  const ports = [];
  const byUnlo = new Map();

  for (const row of wpiRows) {
    const port = normalizeWpi(row);
    if (!port) continue;
    ports.push(port);
    if (port.unlocode) byUnlo.set(port.unlocode, port);
  }

  if (unloPath) {
    const unloRows = await readCsv(unloPath);
    for (const row of unloRows) {
      const country = String(row.Country ?? "").toUpperCase();
      const location = String(row.Location ?? "").toUpperCase();
      if (!country || !location) continue;
      const code = `${country}${location}`;
      const existing = byUnlo.get(code);
      if (existing) {
        if (!existing.meta.sources.includes("UN_LOCODE")) {
          existing.meta.sources.push("UN_LOCODE");
        }
      }
    }
  }

  ports.sort((a, b) => a.name.localeCompare(b.name));

  mkdirSync(path.dirname(OUT), { recursive: true });
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    bbox: BBOX,
    sources: ["NGA_WPI", unloPath ? "UN_LOCODE" : null].filter(Boolean),
    disclaimer:
      "Not for navigation. WPI is a U.S. Government work; do not imply NGA endorsement. UN/LOCODE per UNECE terms.",
    ports,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${ports.length} ports → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
