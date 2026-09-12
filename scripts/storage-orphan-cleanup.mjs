import "dotenv/config";
import { readdirSync, statSync, unlinkSync } from "fs";
import path from "path";

/**
 * Local-storage orphan cleanup (dry-run by default).
 *
 * Finds files under DOCUMENT_STORAGE_LOCAL_DIR older than ORPHAN_MAX_AGE_HOURS
 * under __health__/ and optional temp prefixes. Does NOT delete bookings/* current docs.
 *
 * Usage:
 *   node scripts/storage-orphan-cleanup.mjs
 *   ORPHAN_CLEANUP_APPLY=true node scripts/storage-orphan-cleanup.mjs
 */
const root =
  process.env.DOCUMENT_STORAGE_LOCAL_DIR?.trim() ||
  path.join(process.cwd(), ".data", "documents");
const maxAgeHours = Number(process.env.ORPHAN_MAX_AGE_HOURS ?? "24");
const apply = process.env.ORPHAN_CLEANUP_APPLY === "true";
const cutoff = Date.now() - maxAgeHours * 3600 * 1000;

const SAFE_PREFIXES = ["__health__", "tmp", "quarantine"];

function walk(dir, base = "") {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    const rel = path.join(base, name).replace(/\\/g, "/");
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, rel));
    else out.push({ full, rel, mtime: st.mtimeMs });
  }
  return out;
}

const files = walk(root).filter((f) => {
  const top = f.rel.split("/")[0] ?? "";
  if (!SAFE_PREFIXES.includes(top)) return false;
  return f.mtime < cutoff;
});

console.log(
  apply
    ? `Deleting ${files.length} orphan(s) older than ${maxAgeHours}h`
    : `Dry-run: ${files.length} orphan candidate(s) older than ${maxAgeHours}h`,
);
for (const f of files) {
  console.log(`  ${f.rel}`);
  if (apply) {
    try {
      unlinkSync(f.full);
      try {
        unlinkSync(`${f.full}.meta.json`);
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error("failed", f.rel, err);
    }
  }
}
