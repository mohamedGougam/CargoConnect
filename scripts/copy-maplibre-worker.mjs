import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules", "maplibre-gl", "dist");
const destDir = join(root, "public");

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(destDir, { recursive: true });

for (const file of files) {
  const src = join(dist, file);
  const dest = join(destDir, file);
  if (!existsSync(src)) {
    console.warn(`[copy-maplibre-worker] Missing ${src}`);
    continue;
  }
  copyFileSync(src, dest);
  console.log(`[copy-maplibre-worker] Copied ${file}`);
}
