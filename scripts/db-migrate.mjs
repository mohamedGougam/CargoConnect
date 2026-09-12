import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import postgres from "postgres";

/**
 * Apply pending SQL migrations from drizzle/.
 * Tracks applied files in schema_migrations (created by 0012+).
 * Older CREATE IF NOT EXISTS migrations remain safe to re-apply once when ledger is empty.
 */
async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required for migrations");
    process.exit(1);
  }

  const dir = path.join(process.cwd(), "drizzle");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const sql = postgres(url, { max: 1 });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY NOT NULL,
        applied_at timestamptz NOT NULL
      )
    `;

    const applied = await sql`
      SELECT filename FROM schema_migrations
    `;
    const appliedSet = new Set(applied.map((r) => r.filename));

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log("Migration already applied:", file);
        continue;
      }
      const ddl = readFileSync(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(ddl);
        await tx`
          INSERT INTO schema_migrations (filename, applied_at)
          VALUES (${file}, NOW())
          ON CONFLICT (filename) DO NOTHING
        `;
      });
      console.log("Migration applied:", file);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
