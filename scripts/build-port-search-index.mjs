/**
 * Build the global searchable port index from NGA WPI + UNECE UN/LOCODE.
 *
 * RUNTIME (default — what Render / production must ship):
 *   data/raw/UpdatedPub150.csv   (full NGA WPI, gitignored)
 *   data/raw/unlocode.csv        (full UNECE-derived list, gitignored)
 *   → src/data/ports/port-search-index.json  (COMMITTED generated runtime index)
 *
 * FIXTURE (tests / CI without full dumps):
 *   PORT_INDEX_MODE=fixture npm run ports:build-index
 *   → uses data/fixtures/ports/*.csv only
 *   → writes src/data/ports/port-search-index.fixture.json
 *
 * Never mix fixture CSVs into a runtime build. That was the Tunis failure mode.
 *
 * Refresh sources:
 *   npm run ports:fetch-sources
 *   npm run ports:build-index
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
const fixtureDir = path.join(root, "data/fixtures/ports");
const runtimeOut = path.join(root, "src/data/ports/port-search-index.json");
const fixtureOut = path.join(
  root,
  "src/data/ports/port-search-index.fixture.json",
);

const mode =
  process.argv.includes("--fixture") ||
  (process.env.PORT_INDEX_MODE ?? "runtime").toLowerCase() === "fixture"
    ? "fixture"
    : "runtime";
const isFixtureMode = mode === "fixture";

const displayNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

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

function countryName(codeOrName) {
  const raw = String(codeOrName ?? "").trim();
  if (!raw) return "";
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const iso = raw.toUpperCase();
    const fromIntl = displayNames?.of(iso);
    if (fromIntl && fromIntl !== iso) return fromIntl;
    return iso;
  }
  return raw;
}

function normalizeUnlocode(raw) {
  const cleaned = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!/^[A-Z]{2}[A-Z0-9]{3}$/.test(cleaned)) return undefined;
  return cleaned;
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

function harborTier(size) {
  const s = String(size ?? "").toLowerCase().trim();
  if (s.startsWith("l") || s === "large") return "major";
  if (s.startsWith("m") || s === "medium") return "secondary";
  return "local";
}

function isMaritimeUnlocodeFunction(fn) {
  if (!fn || !String(fn).trim()) return true; // older fixture rows may omit Function
  // UNECE Rec 16: first function character "1" = seaport / maritime terminal
  return String(fn).charAt(0) === "1";
}

function listCsv(dir, predicate) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".csv") && predicate(f))
    .map((f) => path.join(dir, f));
}

async function main() {
  let wpiFiles = [];
  let unloFiles = [];
  let localNamesPath = null;
  let outPath = runtimeOut;
  let indexKind = "runtime_global";

  if (isFixtureMode) {
    indexKind = "fixture";
    outPath = fixtureOut;
    wpiFiles = listCsv(fixtureDir, (f) => f.startsWith("wpi-"));
    unloFiles = listCsv(fixtureDir, (f) => f.startsWith("unlocode-"));
    localNamesPath = path.join(fixtureDir, "port-local-names.csv");
    if (!wpiFiles.length) {
      console.error("PORT_INDEX_MODE=fixture but no data/fixtures/ports/wpi-*.csv");
      process.exit(1);
    }
    console.warn(
      "Building FIXTURE index only — not for production/Render deployment.",
    );
  } else {
    const wpiFull = path.join(rawDir, "UpdatedPub150.csv");
    const unloFull = path.join(rawDir, "unlocode.csv");
    if (!existsSync(wpiFull)) {
      console.error(
        [
          "Missing data/raw/UpdatedPub150.csv for runtime index.",
          "Run: npm run ports:fetch-sources",
          "Do NOT fall back to fixtures for production — that caused Tunis/global gaps.",
        ].join("\n"),
      );
      process.exit(1);
    }
    wpiFiles = [wpiFull];
    if (existsSync(unloFull)) unloFiles = [unloFull];
    else {
      console.warn(
        "Warning: data/raw/unlocode.csv missing — building WPI-only runtime index.",
      );
    }
    localNamesPath = existsSync(path.join(rawDir, "port-local-names.csv"))
      ? path.join(rawDir, "port-local-names.csv")
      : path.join(fixtureDir, "port-local-names.csv");
  }

  /** @type {Map<string, any>} */
  const byUnlo = new Map();
  /** @type {Map<string, any>} */
  const byWpi = new Map();

  let wpiRowsRead = 0;
  let unloRowsRead = 0;
  let wpiAccepted = 0;
  let unloAccepted = 0;

  for (const file of wpiFiles) {
    const rows = await readCsv(file);
    wpiRowsRead += rows.length;
    console.log(`WPI ${path.basename(file)}: ${rows.length} rows`);
    for (const row of rows) {
      const name = String(row["Main Port Name"] ?? "").trim();
      if (!name) continue;
      const lat = num(row.Latitude);
      const lon = num(row.Longitude);
      if (lat === undefined || lon === undefined) continue;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

      const unlocode = normalizeUnlocode(row["UN/LOCODE"]);
      const rawCountryField = String(row["Country Code"] ?? "").trim();
      const isoFromUnlo = unlocode?.slice(0, 2);
      const countryCode =
        isoFromUnlo ||
        (/^[A-Za-z]{2}$/.test(rawCountryField)
          ? rawCountryField.toUpperCase()
          : undefined);
      const country = countryName(countryCode || rawCountryField);
      const wpiRaw = String(row["World Port Index Number"] ?? "").trim();
      const wpiNumber = wpiRaw
        ? String(Math.trunc(Number(wpiRaw)) || wpiRaw.replace(/\.0$/, ""))
        : undefined;
      const alt = String(row["Alternate Port Name"] ?? "").trim();
      const canonicalName = titleCase(name);
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

      const record = {
        id,
        canonicalName,
        aliases: Array.from(aliases),
        city: canonicalName,
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
      wpiAccepted += 1;

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
    unloRowsRead += rows.length;
    console.log(`UN/LOCODE ${path.basename(file)}: ${rows.length} rows`);
    for (const row of rows) {
      const cc = String(row.Country ?? "").trim().toUpperCase();
      const loc = String(row.Location ?? "").trim().toUpperCase();
      if (!cc || !loc) continue;
      if (!isMaritimeUnlocodeFunction(row.Function)) continue;

      const unlocode = normalizeUnlocode(`${cc}${loc}`);
      if (!unlocode) continue;
      const name = String(row.NameWoDiacritics ?? row.Name ?? "").trim();
      if (!name) continue;
      const coords = parseUnlocodeCoords(row.Coordinates);
      const existing = byUnlo.get(unlocode);
      // UN/LOCODE-only rows need coordinates; enrichment of existing WPI is always ok
      if (!existing && !coords) continue;

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
      unloAccepted += 1;
    }
  }

  if (localNamesPath && existsSync(localNamesPath)) {
    const rows = await readCsv(localNamesPath);
    console.log(`Local names: ${rows.length} rows`);
    for (const row of rows) {
      const code = normalizeUnlocode(row.UNLOCODE);
      const alias = String(row.Alias ?? "").trim();
      if (!code || !alias) continue;
      const existing = byUnlo.get(code);
      if (!existing) continue;
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
            .filter(
              (a) => a && normalizeKey(a) !== normalizeKey(p.canonicalName),
            ),
        ),
      ),
    }))
    .sort(
      (a, b) =>
        a.country.localeCompare(b.country) ||
        a.canonicalName.localeCompare(b.canonicalName),
    );

  const countries = new Set(ports.map((p) => p.country));
  const withUnlo = ports.filter((p) => p.unlocode).length;
  const wpiOnly = ports.filter(
    (p) =>
      (p.sources ?? []).includes("NGA_WPI") &&
      !(p.sources ?? []).includes("UN_LOCODE"),
  ).length;
  const unloOnly = ports.filter(
    (p) =>
      (p.sources ?? []).includes("UN_LOCODE") &&
      !(p.sources ?? []).includes("NGA_WPI"),
  ).length;
  const merged = ports.filter(
    (p) =>
      (p.sources ?? []).includes("NGA_WPI") &&
      (p.sources ?? []).includes("UN_LOCODE"),
  ).length;

  const stats = {
    totalPorts: ports.length,
    totalCountries: countries.size,
    portsWithCoordinates: ports.length,
    portsWithUNLocode: withUnlo,
    wpiSourceRows: wpiRowsRead,
    unlocodeSourceRows: unloRowsRead,
    wpiAccepted,
    unlocodeAccepted: unloAccepted,
    wpiOnlyRecords: wpiOnly,
    unlocodeOnlyRecords: unloOnly,
    mergedRecords: merged,
  };

  if (!isFixtureMode && (stats.totalPorts < 500 || stats.totalCountries < 40)) {
    console.error(
      `PORT_CATALOGUE_INCOMPLETE: runtime build produced only ${stats.totalPorts} ports / ${stats.totalCountries} countries`,
    );
    process.exit(2);
  }

  const index = {
    version: 2,
    kind: indexKind,
    generatedAt: new Date().toISOString(),
    primarySources: ["NGA_WPI", "UN_LOCODE"],
    disclaimer:
      "Search index derived from NGA World Port Index and UNECE UN/LOCODE. Not for navigation. No NGA endorsement.",
    portCount: ports.length,
    stats,
    ports,
  };

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(index));
  console.log(`Wrote ${ports.length} ports → ${path.relative(root, outPath)}`);
  console.log(JSON.stringify(stats, null, 2));
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
  const preferWpi = (primary.sources ?? []).includes("NGA_WPI");
  const base = preferWpi ? primary : incoming;
  const other = preferWpi ? incoming : primary;
  return {
    id: base.id || other.id,
    canonicalName: base.canonicalName || other.canonicalName,
    aliases: Array.from(aliases).filter(Boolean),
    city: base.city || other.city,
    country:
      base.country && base.country.length > 2
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
