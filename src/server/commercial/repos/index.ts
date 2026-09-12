import { hasDatabaseUrl } from "@/server/db/client";
import { createMemoryRepositories } from "./memory";
import { createPostgresRepositories } from "./postgres";
import type { CommercialRepositories } from "./types";

let cached: CommercialRepositories | null = null;
let cachedMode: string | null = null;

export type CommercialPersistenceMode = "memory" | "postgres";

/**
 * Persistence selection (actual supported modes):
 * - COMMERCIAL_STORE=memory or NODE_ENV=test → in-memory
 * - DATABASE_URL set or COMMERCIAL_PERSISTENCE=postgres → Postgres
 * - otherwise → in-memory (demo / local without Postgres)
 *
 * There is no active JSON file commercial store. COMMERCIAL_DATA_DIR is unused.
 */
export function getRepositories(): CommercialRepositories {
  const mode = resolveMode();
  if (cached && cachedMode === mode) return cached;
  cachedMode = mode;
  cached =
    mode === "postgres" ? createPostgresRepositories() : createMemoryRepositories();
  return cached;
}

export function getCommercialPersistenceMode(): CommercialPersistenceMode {
  return resolveMode();
}

export function isDemoPersistenceMode(): boolean {
  return resolveMode() === "memory";
}

function resolveMode(): CommercialPersistenceMode {
  if (process.env.COMMERCIAL_STORE === "memory" || process.env.NODE_ENV === "test") {
    return "memory";
  }
  if (hasDatabaseUrl() || process.env.COMMERCIAL_PERSISTENCE === "postgres") {
    return "postgres";
  }
  return "memory";
}

export async function resetCommercialStoreForTests(): Promise<void> {
  process.env.COMMERCIAL_STORE = "memory";
  cached = null;
  cachedMode = null;
  const repos = getRepositories();
  await repos.resetForTests?.();
}

/**
 * Clear in-memory commercial demo state. Hard-refuses Postgres / DATABASE_URL.
 * Requires DEMO_MODE=true.
 */
export async function resetDemoCommercialStore(): Promise<{
  ok: true;
  provider: "memory";
}> {
  if ((process.env.DEMO_MODE ?? "").trim().toLowerCase() !== "true") {
    throw new Error("DEMO_MODE=true is required for demo reset");
  }
  if (hasDatabaseUrl()) {
    throw new Error("Refusing demo reset while DATABASE_URL is set");
  }
  if ((process.env.COMMERCIAL_PERSISTENCE ?? "").trim().toLowerCase() === "postgres") {
    throw new Error("Refusing demo reset while COMMERCIAL_PERSISTENCE=postgres");
  }
  if (resolveMode() !== "memory") {
    throw new Error("Demo reset only supports memory persistence");
  }
  cached = null;
  cachedMode = null;
  process.env.COMMERCIAL_STORE = "memory";
  const repos = getRepositories();
  if (!repos.resetForTests) {
    throw new Error("Memory repository reset unavailable");
  }
  await repos.resetForTests();
  return { ok: true, provider: "memory" };
}

export type { CommercialRepositories, StoredUser } from "./types";
