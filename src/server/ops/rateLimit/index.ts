import { createHash } from "crypto";
import { MemoryRateLimitProvider } from "./memory";
import { RedisRateLimitProvider } from "./redis";
import type { RateLimitProvider, RateLimitResult } from "./types";
import { logger } from "@/server/ops/logger";
import { metrics } from "@/server/ops/metrics";

export type RateLimitPolicy =
  | "login"
  | "signup"
  | "verification_resend"
  | "email_send"
  | "upload"
  | "claim_pdf"
  | "handoff_pdf"
  | "internal_job"
  | "search"
  | "inbound_fixture";

export const RATE_LIMIT_POLICIES: Record<
  RateLimitPolicy,
  { max: number; windowSeconds: number; onRedisFailure: "closed" | "memory" | "open" }
> = {
  login: { max: 10, windowSeconds: 60, onRedisFailure: "memory" },
  signup: { max: 5, windowSeconds: 60, onRedisFailure: "memory" },
  verification_resend: { max: 5, windowSeconds: 3600, onRedisFailure: "memory" },
  email_send: { max: 20, windowSeconds: 3600, onRedisFailure: "memory" },
  upload: { max: 30, windowSeconds: 3600, onRedisFailure: "memory" },
  claim_pdf: { max: 20, windowSeconds: 3600, onRedisFailure: "memory" },
  handoff_pdf: { max: 20, windowSeconds: 3600, onRedisFailure: "memory" },
  internal_job: { max: 30, windowSeconds: 60, onRedisFailure: "closed" },
  search: { max: 60, windowSeconds: 60, onRedisFailure: "open" },
  inbound_fixture: { max: 30, windowSeconds: 60, onRedisFailure: "closed" },
};

const memory = new MemoryRateLimitProvider();
let cached: RateLimitProvider | null = null;

export function getRateLimitProvider(): RateLimitProvider {
  if (cached) return cached;
  const mode = (process.env.RATE_LIMIT_PROVIDER ?? "memory").trim().toLowerCase();
  const hasRedis =
    Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim()) ||
    Boolean(process.env.REDIS_URL?.trim());
  if (mode === "redis" || (mode !== "memory" && hasRedis)) {
    cached = new RedisRateLimitProvider();
    return cached;
  }
  cached = memory;
  return cached;
}

export function resetRateLimitProviderForTests(): void {
  cached = null;
  memory.resetForTests();
}

export function hashRateLimitIdentity(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export async function enforceRateLimit(input: {
  policy: RateLimitPolicy;
  identityParts: string[];
}): Promise<RateLimitResult> {
  const policy = RATE_LIMIT_POLICIES[input.policy];
  const key = `${input.policy}:${input.identityParts.join(":")}`;
  const provider = getRateLimitProvider();

  try {
    const result = await provider.consume({
      key,
      max: policy.max,
      windowSeconds: policy.windowSeconds,
    });
    if (!result.allowed) metrics.rateLimited();
    return result;
  } catch (err) {
    logger.warn("rate_limit.provider_failure", {
      event: "rate_limit.provider_failure",
      provider: provider.name,
      policy: input.policy,
      message: err instanceof Error ? err.message : "unknown",
    });

    if (policy.onRedisFailure === "open") {
      return {
        allowed: true,
        remaining: policy.max,
        provider: provider.name,
        degraded: true,
      };
    }
    if (policy.onRedisFailure === "closed") {
      metrics.rateLimited();
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 30,
        provider: provider.name,
        degraded: true,
      };
    }
    const fallback = await memory.consume({
      key,
      max: Math.max(1, Math.floor(policy.max / 2)),
      windowSeconds: policy.windowSeconds,
    });
    return { ...fallback, degraded: true };
  }
}

export { MemoryRateLimitProvider } from "./memory";
export { RedisRateLimitProvider } from "./redis";
export type { RateLimitProvider, RateLimitResult } from "./types";
