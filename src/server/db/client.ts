import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Lazy Postgres client. Does not connect at import/build time.
 *
 * Recommended production settings (Render / serverless-friendly):
 * - max connections low (default 5) to avoid pool explosion
 * - idle_timeout to recycle idle sockets
 * - connect_timeout for fast failure
 * - prepare: false for PgBouncer / transaction pooling compatibility
 */
export function getDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!db) {
    const max = clampInt(process.env.DB_POOL_MAX, 5, 1, 20);
    const idleTimeout = clampInt(process.env.DB_IDLE_TIMEOUT_SECONDS, 20, 5, 120);
    const connectTimeout = clampInt(process.env.DB_CONNECT_TIMEOUT_SECONDS, 10, 2, 60);
    client = postgres(url, {
      max,
      idle_timeout: idleTimeout,
      connect_timeout: connectTimeout,
      prepare: false,
      onnotice: () => undefined,
    });
    db = drizzle(client, { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    db = null;
  }
}

function clampInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
