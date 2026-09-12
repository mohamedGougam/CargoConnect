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

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const missingUnlo = [];

  for (const p of ports) {
    countries.set(p.country, (countries.get(p.country) ?? 0) + 1);
    const key = normalize(p.canonicalName);
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
    if (!p.unlocode) missingUnlo.push(p.canonicalName);
  }

  const duplicateNames = [...nameMap.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([name, list]) => ({
      name,
      countries: [...new Set(list.map((p) => p.country))],
      unlocodes: list.map((p) => p.unlocode),
    }));

  const crossCountryDupes = duplicateNames.filter((d) => d.countries.length > 1);

  const report = {
    portsLoaded: ports.length,
    countriesRepresented: countries.size,
    countries: Object.fromEntries(
      [...countries.entries()].sort((a, b) => b[1] - a[1]),
    ),
    duplicateNames: duplicateNames.length,
    crossCountryDuplicateNames: crossCountryDupes,
    invalidOrMissingCoordinates: badCoords.length,
    missingUnlocode: missingUnlo.length,
  };

  console.log(JSON.stringify(report, null, 2));

  if (badCoords.length || crossCountryDupes.length) {
    process.exit(2);
  }
}

main();
