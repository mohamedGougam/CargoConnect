import { randomBytes } from "crypto";
import { logger } from "@/server/ops/logger";

export interface JobLeaseResult {
  acquired: boolean;
  ownerId: string;
  reason?: string;
}

export interface WatcherHealthSnapshot {
  lastStartedAt: string | null;
  lastSucceededAt: string | null;
  lastFailedAt: string | null;
  lastDurationMs: number | null;
  lastSummary: Record<string, unknown> | null;
  activeLeaseOwner: string | null;
  leaseUntil: string | null;
}

const memoryLeases = new Map<
  string,
  { ownerId: string; until: number }
>();

let memoryHealth: WatcherHealthSnapshot = {
  lastStartedAt: null,
  lastSucceededAt: null,
  lastFailedAt: null,
  lastDurationMs: null,
  lastSummary: null,
  activeLeaseOwner: null,
  leaseUntil: null,
};

const WATCHER_JOB = "shipment_observation_watcher";

export function getWatcherHealth(): WatcherHealthSnapshot {
  return { ...memoryHealth };
}

export function resetJobLockForTests(): void {
  memoryLeases.clear();
  memoryHealth = {
    lastStartedAt: null,
    lastSucceededAt: null,
    lastFailedAt: null,
    lastDurationMs: null,
    lastSummary: null,
    activeLeaseOwner: null,
    leaseUntil: null,
  };
}

/**
 * Acquire a short lease for overlapping cron protection.
 * Uses in-process lock always; when Postgres is configured also uses job_leases table.
 */
export async function acquireJobLease(input: {
  jobName?: string;
  ttlSeconds?: number;
}): Promise<JobLeaseResult> {
  const jobName = input.jobName ?? WATCHER_JOB;
  const ttlSeconds = input.ttlSeconds ?? 240;
  const ownerId = `owner_${randomBytes(8).toString("hex")}`;
  const now = Date.now();
  const until = now + ttlSeconds * 1000;

  const existing = memoryLeases.get(jobName);
  if (existing && existing.until > now) {
    return {
      acquired: false,
      ownerId: existing.ownerId,
      reason: "lease_held",
    };
  }

  // Best-effort DB lease when available
  if (process.env.DATABASE_URL?.trim() && process.env.COMMERCIAL_PERSISTENCE === "postgres") {
    try {
      const dbOk = await tryAcquireDbLease(jobName, ownerId, until);
      if (!dbOk) {
        return { acquired: false, ownerId, reason: "db_lease_held" };
      }
    } catch (err) {
      logger.warn("job_lease.db_error", {
        event: "job_lease.db_error",
        message: err instanceof Error ? err.message : "unknown",
      });
      // Fall through to memory-only lease for single-instance resilience
    }
  }

  memoryLeases.set(jobName, { ownerId, until });
  memoryHealth.activeLeaseOwner = ownerId;
  memoryHealth.leaseUntil = new Date(until).toISOString();
  return { acquired: true, ownerId };
}

export async function releaseJobLease(input: {
  jobName?: string;
  ownerId: string;
}): Promise<void> {
  const jobName = input.jobName ?? WATCHER_JOB;
  const existing = memoryLeases.get(jobName);
  if (existing?.ownerId === input.ownerId) {
    memoryLeases.delete(jobName);
  }
  if (memoryHealth.activeLeaseOwner === input.ownerId) {
    memoryHealth.activeLeaseOwner = null;
    memoryHealth.leaseUntil = null;
  }
  if (process.env.DATABASE_URL?.trim() && process.env.COMMERCIAL_PERSISTENCE === "postgres") {
    try {
      await releaseDbLease(jobName, input.ownerId);
    } catch {
      /* ignore */
    }
  }
}

export function recordWatcherStart(): void {
  memoryHealth.lastStartedAt = new Date().toISOString();
}

export function recordWatcherSuccess(
  durationMs: number,
  summary: Record<string, unknown>,
): void {
  memoryHealth.lastSucceededAt = new Date().toISOString();
  memoryHealth.lastDurationMs = durationMs;
  memoryHealth.lastSummary = summary;
}

export function recordWatcherFailure(
  durationMs: number,
  summary: Record<string, unknown>,
): void {
  memoryHealth.lastFailedAt = new Date().toISOString();
  memoryHealth.lastDurationMs = durationMs;
  memoryHealth.lastSummary = summary;
}

export function isWatcherStale(maxAgeSeconds: number): boolean {
  if (!memoryHealth.lastSucceededAt) return true;
  const age =
    Date.now() - new Date(memoryHealth.lastSucceededAt).getTime();
  return age > maxAgeSeconds * 1000;
}

async function tryAcquireDbLease(
  jobName: string,
  ownerId: string,
  untilMs: number,
): Promise<boolean> {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL!.trim();
  const sql = postgres(url, { max: 1, idle_timeout: 5 });
  try {
    const until = new Date(untilMs).toISOString();
    const rows = await sql<{ owner_id: string }[]>`
      INSERT INTO job_leases (job_name, owner_id, leased_until, updated_at)
      VALUES (${jobName}, ${ownerId}, ${until}::timestamptz, NOW())
      ON CONFLICT (job_name) DO UPDATE
        SET owner_id = EXCLUDED.owner_id,
            leased_until = EXCLUDED.leased_until,
            updated_at = NOW()
        WHERE job_leases.leased_until < NOW()
      RETURNING owner_id
    `;
    return rows[0]?.owner_id === ownerId;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

async function releaseDbLease(jobName: string, ownerId: string): Promise<void> {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL!.trim();
  const sql = postgres(url, { max: 1, idle_timeout: 5 });
  try {
    await sql`
      DELETE FROM job_leases
      WHERE job_name = ${jobName} AND owner_id = ${ownerId}
    `;
  } finally {
    await sql.end({ timeout: 2 });
  }
}
