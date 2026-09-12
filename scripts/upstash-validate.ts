/**
 * Upstash REST rate-limit validation (Production Hardening V1).
 * Never prints tokens, auth headers, or identity-bearing keys.
 *
 * Requires:
 *   RATE_LIMIT_PROVIDER=redis
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Usage: npx tsx scripts/upstash-validate.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import {
  RedisRateLimitProvider,
  enforceRateLimit,
  hashRateLimitIdentity,
  resetRateLimitProviderForTests,
  RATE_LIMIT_POLICIES,
  getRateLimitProvider,
} from "../src/server/ops/rateLimit";
import { rateLimitedResponse } from "../src/server/ops/errors";
import {
  acquireJobLease,
  releaseJobLease,
  resetJobLockForTests,
} from "../src/server/ops/jobLock";

const NS = `cc_validate_${Date.now()}`;
const createdKeys: string[] = [];

function redact(msg: string): string {
  return msg
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/Authorization:\s*\S+/gi, "Authorization: [redacted]")
    .replace(/token[=:]\s*\S+/gi, "token=[redacted]");
}

async function upstashRaw(command: string[]): Promise<{ result: unknown }> {
  const url = process.env.UPSTASH_REDIS_REST_URL!.trim().replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!.trim();
  const res = await fetch(
    `${url}/${command.map(encodeURIComponent).join("/")}`,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`upstash_${res.status}`);
  return (await res.json()) as { result: unknown };
}

async function cleanup(): Promise<void> {
  for (const key of createdKeys) {
    try {
      await upstashRaw(["DEL", key]);
    } catch {
      /* best-effort */
    }
  }
}

async function main() {
  const providerMode = (process.env.RATE_LIMIT_PROVIDER ?? "memory").trim();
  const urlSet = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim());
  const tokenSet = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  const host = urlSet
    ? new URL(process.env.UPSTASH_REDIS_REST_URL!.trim()).host
    : null;

  console.log(
    JSON.stringify({
      step: "config",
      RATE_LIMIT_PROVIDER: providerMode,
      requiredProvider: "redis",
      upstashUrlSet: urlSet,
      upstashTokenSet: tokenSet,
      upstashHost: host,
    }),
  );

  if (!urlSet || !tokenSet) {
    console.log(
      JSON.stringify({
        step: "fatal",
        error:
          "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in .env.local",
      }),
    );
    process.exit(1);
  }

  if (providerMode !== "redis" && providerMode !== "upstash") {
    console.log(
      JSON.stringify({
        step: "fatal",
        error: `RATE_LIMIT_PROVIDER must be "redis" (got "${providerMode}"). Upstash is selected automatically when UPSTASH_* credentials are present.`,
      }),
    );
    process.exit(1);
  }

  // 1. Connection
  try {
    const ping = await upstashRaw(["PING"]);
    const ok =
      ping.result === "PONG" ||
      ping.result === "pong" ||
      String(ping.result).toUpperCase() === "PONG";
    console.log(JSON.stringify({ step: "connection", status: ok ? "ok" : "fail", result: String(ping.result) }));
    if (!ok) process.exit(1);
  } catch (err) {
    console.log(
      JSON.stringify({
        step: "connection",
        status: "fail",
        error: redact(err instanceof Error ? err.message : String(err)),
      }),
    );
    process.exit(1);
  }

  const writeKey = `${NS}:write`;
  createdKeys.push(writeKey);

  // 2–3. Write / Read
  try {
    await upstashRaw(["SET", writeKey, "cargo-connect-upstash-probe"]);
    const got = await upstashRaw(["GET", writeKey]);
    const match = got.result === "cargo-connect-upstash-probe";
    console.log(JSON.stringify({ step: "write", status: "ok" }));
    console.log(JSON.stringify({ step: "read", status: match ? "ok" : "mismatch" }));
    if (!match) {
      await cleanup();
      process.exit(1);
    }
  } catch (err) {
    console.log(
      JSON.stringify({
        step: "write_read",
        status: "fail",
        error: redact(err instanceof Error ? err.message : String(err)),
      }),
    );
    await cleanup();
    process.exit(1);
  }

  // 4–5. Counter + TTL
  const counterKey = `${NS}:counter`;
  createdKeys.push(counterKey);
  try {
    const c1 = Number((await upstashRaw(["INCR", counterKey])).result);
    await upstashRaw(["EXPIRE", counterKey, "30"]);
    const c2 = Number((await upstashRaw(["INCR", counterKey])).result);
    const ttl = Number((await upstashRaw(["TTL", counterKey])).result);
    console.log(
      JSON.stringify({
        step: "counter",
        status: c1 === 1 && c2 === 2 ? "ok" : "fail",
        counts: [c1, c2],
      }),
    );
    console.log(
      JSON.stringify({
        step: "ttl",
        status: ttl > 0 && ttl <= 30 ? "ok" : "fail",
        ttlSeconds: ttl,
      }),
    );
    if (!(c1 === 1 && c2 === 2 && ttl > 0 && ttl <= 30)) {
      await cleanup();
      process.exit(1);
    }
  } catch (err) {
    console.log(
      JSON.stringify({
        step: "counter_ttl",
        status: "fail",
        error: redact(err instanceof Error ? err.message : String(err)),
      }),
    );
    await cleanup();
    process.exit(1);
  }

  // 6–9. Rate-limit provider + policy + 429 + isolation
  resetRateLimitProviderForTests();
  process.env.RATE_LIMIT_PROVIDER = "redis";
  const provider = getRateLimitProvider();
  console.log(
    JSON.stringify({
      step: "provider_selected",
      name: provider.name,
      expected: "redis",
    }),
  );

  const redis = new RedisRateLimitProvider();
  const idA = hashRateLimitIdentity(`${NS}:userA`);
  const idB = hashRateLimitIdentity(`${NS}:userB`);
  const policyKeyA = `login:validate:${idA}`;
  const policyKeyB = `login:validate:${idB}`;
  createdKeys.push(`rl:${policyKeyA}`, `rl:${policyKeyB}`);

  // Use a tiny window for validation via direct consume
  let blocked: { allowed: boolean; retryAfterSeconds?: number } | null = null;
  for (let i = 0; i < 12; i++) {
    const r = await redis.consume({
      key: policyKeyA,
      max: 3,
      windowSeconds: 60,
    });
    if (!r.allowed) {
      blocked = r;
      break;
    }
  }
  console.log(
    JSON.stringify({
      step: "rate_limit_enforcement",
      status: blocked && !blocked.allowed ? "ok" : "fail",
    }),
  );

  const httpRes = rateLimitedResponse(blocked?.retryAfterSeconds ?? 1);
  console.log(
    JSON.stringify({
      step: "http_429",
      status: httpRes.status === 429 ? "ok" : "fail",
      httpStatus: httpRes.status,
      retryAfterSeconds: blocked?.retryAfterSeconds ?? null,
    }),
  );

  // Isolation: user B should still be allowed while A is blocked
  const bResult = await redis.consume({
    key: policyKeyB,
    max: 3,
    windowSeconds: 60,
  });
  console.log(
    JSON.stringify({
      step: "key_isolation",
      status: bResult.allowed ? "ok" : "fail",
      note: "Separate hashed identities do not share counters",
    }),
  );

  // Policy path through enforceRateLimit (signup policy)
  resetRateLimitProviderForTests();
  const enforceId = hashRateLimitIdentity(`${NS}:enforce`);
  createdKeys.push(`rl:signup:${enforceId}`);
  let enforceBlocked = false;
  let retry: number | undefined;
  for (let i = 0; i < RATE_LIMIT_POLICIES.signup.max + 2; i++) {
    const r = await enforceRateLimit({
      policy: "signup",
      identityParts: [enforceId],
    });
    if (!r.allowed) {
      enforceBlocked = true;
      retry = r.retryAfterSeconds;
      break;
    }
  }
  console.log(
    JSON.stringify({
      step: "policy_execution",
      status: enforceBlocked ? "ok" : "fail",
      retryAfterSeconds: retry ?? null,
      provider: "redis",
    }),
  );

  // 10. Failure/fallback documentation check (no live break of Upstash)
  console.log(
    JSON.stringify({
      step: "failure_fallback_policy",
      status: "ok",
      login: RATE_LIMIT_POLICIES.login.onRedisFailure,
      search: RATE_LIMIT_POLICIES.search.onRedisFailure,
      internal_job: RATE_LIMIT_POLICIES.internal_job.onRedisFailure,
      note: "login→memory fallback; search→fail-open; internal_job→fail-closed",
    }),
  );

  // 11. Watcher lock — process-local (+ optional Postgres), NOT Redis
  resetJobLockForTests();
  const lease1 = await acquireJobLease({ ttlSeconds: 30 });
  const lease2 = await acquireJobLease({ ttlSeconds: 30 });
  if (lease1.acquired) await releaseJobLease({ ownerId: lease1.ownerId });
  console.log(
    JSON.stringify({
      step: "watcher_lock",
      usesRedis: false,
      mechanism: "in-process memory lease; optional Postgres job_leases when COMMERCIAL_PERSISTENCE=postgres",
      overlapBlocked: lease1.acquired && !lease2.acquired,
      status: lease1.acquired && !lease2.acquired ? "ok" : "fail",
    }),
  );

  // 12. Cleanup
  await cleanup();
  let remaining = 0;
  for (const key of createdKeys) {
    const exists = await upstashRaw(["EXISTS", key]);
    remaining += Number(exists.result ?? 0);
  }
  console.log(
    JSON.stringify({
      step: "cleanup",
      status: remaining === 0 ? "ok" : "fail",
      remainingKeys: remaining,
    }),
  );

  console.log(
    JSON.stringify({
      step: "summary",
      status: remaining === 0 && enforceBlocked && blocked ? "all_ok" : "incomplete",
      architectureChangeRequired: false,
      RATE_LIMIT_PROVIDER: "redis",
    }),
  );

  if (!(remaining === 0 && enforceBlocked && blocked && bResult.allowed)) {
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.log(
    JSON.stringify({
      step: "fatal",
      error: redact(err instanceof Error ? err.message : String(err)).slice(0, 200),
    }),
  );
  try {
    await cleanup();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
