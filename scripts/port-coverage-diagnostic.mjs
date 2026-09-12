/**
 * Port search index coverage diagnostic.
 * Usage: npm run ports:coverage
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "src/data/ports/port-search-index.json");

const GUARD_COUNTRIES = [
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
];

function main() {
  if (!existsSync(indexPath)) {
    console.error("Missing port-search-index.json — run npm run ports:build-index");
    process.exit(1);
  }
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const ports = index.ports ?? [];
  const countries = new Map();
  const nameMap = new Map();
  const badCoords = [];

  for (const p of ports) {
    countries.set(p.country, (countries.get(p.country) ?? 0) + 1);
    const key = String(p.canonicalName ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key).push(p);
    if (
      !Number.isFinite(p.latitude) ||
      !Number.isFinite(p.longitude) ||
      Math.abs(p.latitude) > 90 ||
      Math.abs(p.longitude) > 180
    ) {
      badCoords.push(p);
    }
  }

  const countrySet = new Set(countries.keys());
  const guardMissing = GUARD_COUNTRIES.filter((c) => !countrySet.has(c));
  const incomplete =
    index.kind === "fixture" ||
    ports.length < 500 ||
    countries.size < 40 ||
    guardMissing.length > 0;

  const report = {
    kind: index.kind ?? "unknown",
    generatedAt: index.generatedAt,
    stats: index.stats ?? null,
    portsLoaded: ports.length,
    countriesRepresented: countries.size,
    guardCountriesMissing: guardMissing,
    incomplete,
    incompleteCode: incomplete ? "PORT_CATALOGUE_INCOMPLETE" : null,
    invalidOrMissingCoordinates: badCoords.length,
  };

  console.log(JSON.stringify(report, null, 2));

  if (incomplete || badCoords.length) {
    process.exit(2);
  }
}

main();
