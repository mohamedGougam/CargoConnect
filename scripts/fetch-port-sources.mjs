/**
 * Download pinned full port catalogue sources into data/raw/ (gitignored).
 *
 *   npm run ports:fetch-sources
 *   npm run ports:build-index
 *
 * Sources:
 *   - NGA World Port Index UpdatedPub150.csv (U.S. Government work)
 *   - UNECE UN/LOCODE code list via datasets/un-locode redistribution
 */
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const rawDir = path.join(root, "data/raw");

const SOURCES = [
  {
    name: "UpdatedPub150.csv",
    url: "https://msi.nga.mil/api/publications/download?type=view&key=16920959/SFH00000/UpdatedPub150.csv",
    minBytes: 1_000_000,
    headerMustInclude: "Main Port Name",
  },
  {
    name: "unlocode.csv",
    url: "https://raw.githubusercontent.com/datasets/un-locode/master/data/code-list.csv",
    minBytes: 1_000_000,
    headerMustInclude: "Country,Location,Name",
  },
];

async function download(source) {
  const dest = path.join(rawDir, source.name);
  console.log(`Fetching ${source.name}…`);
  const res = await fetch(source.url, {
    headers: { "User-Agent": "CargoConnect-port-catalogue/1.0" },
    redirect: "follow",
  });
  if (!res.ok || !res.body) {
    throw new Error(`Failed ${source.url}: HTTP ${res.status}`);
  }
  mkdirSync(rawDir, { recursive: true });
  await pipeline(res.body, createWriteStream(dest));
  const { readFileSync, statSync } = await import("node:fs");
  const size = statSync(dest).size;
  if (size < source.minBytes) {
    throw new Error(`${source.name} too small (${size} bytes) — likely not the full dump`);
  }
  const head = readFileSync(dest, "utf8").slice(0, 500);
  if (!head.includes(source.headerMustInclude)) {
    throw new Error(
      `${source.name} header validation failed (got: ${head.slice(0, 120).replace(/\n/g, " ")})`,
    );
  }
  console.log(`  → ${path.relative(root, dest)} (${size.toLocaleString()} bytes)`);
}

async function main() {
  mkdirSync(rawDir, { recursive: true });
  for (const source of SOURCES) {
    await download(source);
  }
  console.log(
    "Sources ready. Next: npm run ports:build-index  (commits the generated runtime JSON)",
  );
  if (!existsSync(path.join(rawDir, "UpdatedPub150.csv"))) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
