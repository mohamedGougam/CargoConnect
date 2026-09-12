import "dotenv/config";
import { readdirSync } from "fs";
import path from "path";
import postgres from "postgres";

/**
 * Report migration status without mutating the database.
 * npm run db:status
 */
async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const dir = path.join(process.cwd(), "drizzle");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const sql = postgres(url, { max: 1, connect_timeout: 10 });
  try {
    await sql`SELECT 1`;
    console.log("database: reachable");

    const tables = await sql`
      SELECT to_regclass('public.schema_migrations') AS reg
    `;
    if (!tables[0]?.reg) {
      console.log("schema_migrations: missing (run npm run db:migrate)");
      console.log("pending:", files.join(", ") || "(none)");
      process.exit(0);
    }

    const applied = await sql`
      SELECT filename, applied_at FROM schema_migrations ORDER BY filename
    `;
    const appliedSet = new Set(applied.map((r) => r.filename));
    const pending = files.filter((f) => !appliedSet.has(f));

    console.log("applied:");
    for (const row of applied) {
      console.log(`  - ${row.filename} @ ${new Date(row.applied_at).toISOString()}`);
    }
    console.log("pending:");
    if (pending.length === 0) console.log("  (none)");
    else for (const f of pending) console.log(`  - ${f}`);

    process.exit(pending.length === 0 ? 0 : 2);
  } catch (err) {
    console.error("database: unreachable");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
