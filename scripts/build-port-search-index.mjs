/**
 * Build the global searchable port index from NGA WPI + UNECE UN/LOCODE.
 *
 * Primary inputs (first existing wins per pattern):
 *   data/raw/UpdatedPub150.csv          (full NGA WPI, gitignored)
 *   data/raw/wpi-*.fixture.csv          (committed fixtures)
 *   data/raw/unlocode.csv               (full UNECE, gitignored)
 *   data/raw/unlocode-*.fixture.csv
 *
 * Output:
 *   src/data/ports/port-search-index.json
 *
 * Also keeps eastern-med catalog generation via npm run import:ports.
 *
 * Licensing: WPI is U.S. Government work (no NGA endorsement).
 * UN/LOCODE redistributable per UNECE terms. Not for navigation.
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const rawDir = path.join(root, "data/raw");
const outPath = path.join(root, "src/data/ports/port-search-index.json");

/** ISO 3166-1 alpha-2 → English country name (search index). */
const COUNTRY_NAMES = {
  NL: "Netherlands",
  DE: "Germany",
  BE: "Belgium",
  GB: "United Kingdom",
  NO: "Norway",
  ES: "Spain",
  DZ: "Algeria",
  GR: "Greece",
  EG: "Egypt",
  TR: "Turkey",
  SG: "Singapore",
  MY: "Malaysia",
  CN: "China",
  KR: "South Korea",
  JP: "Japan",
  AE: "United Arab Emirates",
  IN: "India",
  US: "United States",
  AU: "Australia",
  ZA: "South Africa",
  CY: "Cyprus",
  IL: "Israel",
  MT: "Malta",
  IT: "Italy",
  FR: "France",
  PL: "Poland",
  BR: "Brazil",
  HK: "Hong Kong",
  VN: "Vietnam",
  SA: "Saudi Arabia",
  PT: "Portugal",
  MA: "Morocco",
  TN: "Tunisia",
  LY: "Libya",
  LB: "Lebanon",
  SY: "Syria",
  HR: "Croatia",
  SI: "Slovenia",
  AL: "Albania",
  ME: "Montenegro",
  BA: "Bosnia and Herzegovina",
  SE: "Sweden",
  DK: "Denmark",
  FI: "Finland",
  IE: "Ireland",
  CA: "Canada",
  MX: "Mexico",
  PA: "Panama",
  CL: "Chile",
  PE: "Peru",
  AR: "Argentina",
  NZ: "New Zealand",
  PH: "Philippines",
  TH: "Thailand",
  ID: "Indonesia",
  TW: "Taiwan",
  OM: "Oman",
  QA: "Qatar",
  KW: "Kuwait",
  BH: "Bahrain",
  JO: "Jordan",
  IQ: "Iraq",
  IR: "Iran",
  PK: "Pakistan",
  BD: "Bangladesh",
  LK: "Sri Lanka",
  NG: "Nigeria",
  GH: "Ghana",
  KE: "Kenya",
  TZ: "Tanzania",
  MZ: "Mozambique",
  AO: "Angola",
  SN: "Senegal",
  CI: "Cote d'Ivoire",
  RU: "Russia",
  UA: "Ukraine",
  RO: "Romania",
  BG: "Bulgaria",
  GE: "Georgia",
};

async function readCsv(filePath) {
  const lines = [];
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
  });
  for await (const line of rl) lines.push(line);
  if (!lines.length) return [];
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
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else current += ch;
  }
  result.push(current);
  return result;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function titleCase(name) {
  return String(name)
    .toLowerCase()
    .split(/(\s+|\/)/)
    .map((p) =>
      /^\s+$/.test(p) || p === "/"
        ? p
        : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join("");
}

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countryName(code) {
  const c = String(code ?? "").trim().toUpperCase();
  return COUNTRY_NAMES[c] ?? c;
}

function parseUnlocodeCoords(raw) {
  if (!raw?.trim()) return undefined;
  const m = raw.trim().match(/^(\d{2})(\d{2})([NS])\s+(\d{3})(\d{2})([EW])$/i);
  if (!m) return undefined;
  let lat = Number(m[1]) + Number(m[2]) / 60;
  let lon = Number(m[4]) + Number(m[5]) / 60;
  if (m[3].toUpperCase() === "S") lat = -lat;
  if (m[6].toUpperCase() === "W") lon = -lon;
  return { latitude: lat, longitude: lon };
}

function listMatching(dir, prefix) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".csv"))
    .map((f) => path.join(dir, f));
}

function harborTier(size) {
  const s = String(size ?? "").toLowerCase();
  if (s.startsWith("l")) return "major";
  if (s.startsWith("m")) return "secondary";
  return "local";
}

async function main() {
  const wpiFiles = [
    path.join(rawDir, "UpdatedPub150.csv"),
    ...listMatching(rawDir, "wpi-"),
  ].filter(existsSync);

  const unloFiles = [
    path.join(rawDir, "unlocode.csv"),
    ...listMatching(rawDir, "unlocode-"),
  ].filter(existsSync);

  if (!wpiFiles.length) {
    console.error("No WPI CSV found under data/raw/");
    process.exit(1);
  }

  /** @type {Map<string, any>} */
  const byUnlo = new Map();
  /** @type {Map<string, any>} */
  const byWpi = new Map();

  for (const file of wpiFiles) {
    const rows = await readCsv(file);
    console.log(`WPI ${path.basename(file)}: ${rows.length} rows`);
    for (const row of rows) {
      const name = String(row["Main Port Name"] ?? "").trim();
      if (!name) continue;
      const lat = num(row.Latitude);
      const lon = num(row.Longitude);
      if (lat === undefined || lon === undefined) continue;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

      const countryCode = String(row["Country Code"] ?? "")
        .trim()
        .toUpperCase();
      const unlocode = String(row["UN/LOCODE"] ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
      const wpiNumber = String(row["World Port Index Number"] ?? "").trim();
      const alt = String(row["Alternate Port Name"] ?? "").trim();
      const country = countryName(countryCode);
      const canonicalName = titleCase(name);
      const city = canonicalName; // WPI main name is typically the port/city identity
      const id = unlocode
        ? `port-${unlocode.toLowerCase()}`
        : wpiNumber
          ? `port-wpi-${wpiNumber}`
          : `port-${normalizeKey(name).replace(/\s+/g, "-")}`;

      const aliases = new Set();
      if (alt) {
        for (const part of alt.split(/[;/|]/)) {
          const t = part.trim();
          if (t) aliases.add(titleCase(t));
        }
      }
      aliases.add(canonicalName);

      const record = {
        id,
        canonicalName,
        aliases: Array.from(aliases),
        city,
        country,
        countryCode: countryCode || undefined,
        unlocode: unlocode || undefined,
        latitude: lat,
        longitude: lon,
        wpiNumber: wpiNumber || undefined,
        harborSize: String(row["Harbor Size"] ?? "").trim() || undefined,
        tier: harborTier(row["Harbor Size"]),
        sources: ["NGA_WPI"],
      };

      if (unlocode) {
        const prev = byUnlo.get(unlocode);
        if (!prev || (record.tier === "major" && prev.tier !== "major")) {
          byUnlo.set(unlocode, mergeRecords(prev, record));
        } else {
          byUnlo.set(unlocode, mergeRecords(record, prev));
        }
      } else if (wpiNumber) {
        byWpi.set(wpiNumber, mergeRecords(byWpi.get(wpiNumber), record));
      }
    }
  }

  for (const file of unloFiles) {
    const rows = await readCsv(file);
    console.log(`UN/LOCODE ${path.basename(file)}: ${rows.length} rows`);
    for (const row of rows) {
      const cc = String(row.Country ?? "").trim().toUpperCase();
      const loc = String(row.Location ?? "").trim().toUpperCase();
      if (!cc || !loc) continue;
      // Prefer seaport-like functions when Function present (1 = port)
      const fn = String(row.Function ?? "");
      if (fn && !fn.includes("1")) continue;

      const unlocode = `${cc}${loc}`;
      const name = String(row.NameWoDiacritics ?? row.Name ?? "").trim();
      if (!name) continue;
      const coords = parseUnlocodeCoords(row.Coordinates);
      const existing = byUnlo.get(unlocode);
      const patch = {
        id: `port-${unlocode.toLowerCase()}`,
        canonicalName: titleCase(name),
        aliases: [titleCase(name), String(row.Name ?? "").trim()].filter(
          Boolean,
        ),
        city: titleCase(name),
        country: countryName(cc),
        countryCode: cc,
        unlocode,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        sources: ["UN_LOCODE"],
        tier: "local",
      };
      byUnlo.set(unlocode, mergeRecords(existing, patch));
    }
  }

  // Same-UN/LOCODE exonyms / local names (never cross-code)
  const localNamesPath = path.join(rawDir, "port-local-names.csv");
  if (existsSync(localNamesPath)) {
    const rows = await readCsv(localNamesPath);
    console.log(`Local names: ${rows.length} rows`);
    for (const row of rows) {
      const code = String(row.UNLOCODE ?? "").trim().toUpperCase();
      const alias = String(row.Alias ?? "").trim();
      if (!code || !alias) continue;
      const existing = byUnlo.get(code);
      if (!existing) continue;
      if (existing.unlocode && existing.unlocode.toUpperCase() !== code) continue;
      existing.aliases = Array.from(
        new Set([...(existing.aliases ?? []), alias]),
      );
      byUnlo.set(code, existing);
    }
  }

  const ports = [
    ...byUnlo.values(),
    ...[...byWpi.values()].filter((p) => !p.unlocode || !byUnlo.has(p.unlocode)),
  ]
    .filter(
      (p) =>
        Number.isFinite(p.latitude) &&
        Number.isFinite(p.longitude) &&
        p.canonicalName,
    )
    .map((p) => ({
      ...p,
      aliases: Array.from(
        new Set(
          (p.aliases ?? [])
            .map((a) => String(a).trim())
            .filter((a) => a && normalizeKey(a) !== normalizeKey(p.canonicalName)),
        ),
      ),
    }))
    .sort((a, b) =>
      a.country.localeCompare(b.country) ||
      a.canonicalName.localeCompare(b.canonicalName),
    );

  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    primarySources: ["NGA_WPI", "UN_LOCODE"],
    disclaimer:
      "Search index derived from NGA World Port Index and/or UNECE UN/LOCODE fixtures. Not for navigation. No NGA endorsement.",
    portCount: ports.length,
    ports,
  };

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(index, null, 2));
  console.log(`Wrote ${ports.length} ports → ${path.relative(root, outPath)}`);

  // Coverage summary
  const countries = new Set(ports.map((p) => p.country));
  const dupNames = findDuplicateNames(ports);
  const badCoords = ports.filter(
    (p) =>
      !Number.isFinite(p.latitude) ||
      !Number.isFinite(p.longitude) ||
      Math.abs(p.latitude) > 90 ||
      Math.abs(p.longitude) > 180,
  );
  console.log(
    JSON.stringify(
      {
        countries: countries.size,
        ports: ports.length,
        duplicateNames: dupNames.length,
        invalidCoordinates: badCoords.length,
      },
      null,
      2,
    ),
  );
}

function mergeRecords(primary, incoming) {
  if (!primary) return { ...incoming };
  if (!incoming) return { ...primary };
  const aliases = new Set([
    ...(primary.aliases ?? []),
    ...(incoming.aliases ?? []),
    primary.canonicalName,
    incoming.canonicalName,
  ]);
  const sources = Array.from(
    new Set([...(primary.sources ?? []), ...(incoming.sources ?? [])]),
  );
  // Prefer WPI geometry & harbor metadata; fill gaps from UN/LOCODE
  const preferWpi = (primary.sources ?? []).includes("NGA_WPI");
  const base = preferWpi ? primary : incoming;
  const other = preferWpi ? incoming : primary;
  return {
    id: base.id || other.id,
    canonicalName: base.canonicalName || other.canonicalName,
    aliases: Array.from(aliases).filter(Boolean),
    city: base.city || other.city,
    country:
      base.country && base.country !== base.countryCode
        ? base.country
        : other.country || base.country,
    countryCode: base.countryCode || other.countryCode,
    unlocode: base.unlocode || other.unlocode,
    latitude: base.latitude ?? other.latitude,
    longitude: base.longitude ?? other.longitude,
    wpiNumber: base.wpiNumber || other.wpiNumber,
    harborSize: base.harborSize || other.harborSize,
    tier: base.tier === "major" ? "major" : other.tier || base.tier,
    sources,
  };
}

function findDuplicateNames(ports) {
  const map = new Map();
  for (const p of ports) {
    const k = normalizeKey(p.canonicalName);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  return [...map.entries()].filter(([, list]) => list.length > 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
