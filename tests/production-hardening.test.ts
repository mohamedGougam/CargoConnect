import { beforeEach, describe, expect, it } from "vitest";
import {
  MemoryRateLimitProvider,
  enforceRateLimit,
  resetRateLimitProviderForTests,
  hashRateLimitIdentity,
} from "@/server/ops/rateLimit";
import {
  NoopMalwareScanProvider,
  setMalwareScanProviderForTests,
  resetMalwareScanProviderForTests,
  toDocumentScanStatus,
  isDocumentUsableForReadiness,
  isDocumentDownloadBlocked,
} from "@/server/ops/malware";
import type { MalwareScanProvider } from "@/server/ops/malware";
import {
  acquireJobLease,
  releaseJobLease,
  resetJobLockForTests,
  recordWatcherSuccess,
  isWatcherStale,
  getWatcherHealth,
} from "@/server/ops/jobLock";
import { checkLive, checkReady } from "@/server/ops/health";
import { resolveIncomingRequestId } from "@/server/ops/correlation";
import { rateLimitedResponse } from "@/server/ops/errors";
import { LocalDocumentStorage } from "@/server/documents/storage/local";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { getAisProviderMode, getAisProviderLabel } from "@/server/ops/aisMode";

describe("production hardening failure modes", () => {
  beforeEach(() => {
    resetRateLimitProviderForTests();
    resetMalwareScanProviderForTests();
    resetJobLockForTests();
    process.env.RATE_LIMIT_PROVIDER = "memory";
    process.env.MALWARE_SCAN_PROVIDER = "noop";
    delete process.env.MALWARE_SCAN_ALLOW_NOOP;
    delete process.env.DATABASE_URL;
    delete process.env.COMMERCIAL_PERSISTENCE;
    process.env.COMMERCIAL_STORE = "memory";
  });

  it("enforces memory rate limits with 429 retry info", async () => {
    const mem = new MemoryRateLimitProvider();
    for (let i = 0; i < 10; i++) {
      const r = await mem.consume({ key: "login:x", max: 10, windowSeconds: 60 });
      expect(r.allowed).toBe(true);
    }
    const blocked = await mem.consume({
      key: "login:x",
      max: 10,
      windowSeconds: 60,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    const res = rateLimitedResponse(blocked.retryAfterSeconds);
    expect(res.status).toBe(429);
  });

  it("hashes identities so raw emails are not used as limiter keys", () => {
    const a = hashRateLimitIdentity("user@example.com");
    expect(a).not.toContain("@");
    expect(a).toHaveLength(32);
  });

  it("maps malware scan results without silent clean when real scan required", () => {
    expect(
      toDocumentScanStatus({
        status: "CLEAN",
        provider: "http",
        scannedAt: new Date().toISOString(),
      }),
    ).toBe("CLEAN");
    expect(
      toDocumentScanStatus({
        status: "INFECTED",
        provider: "http",
        scannedAt: new Date().toISOString(),
      }),
    ).toBe("INFECTED");
    expect(
      toDocumentScanStatus({
        status: "UNAVAILABLE",
        provider: "http",
        scannedAt: new Date().toISOString(),
      }),
    ).toBe("SCAN_FAILED");

    process.env.MALWARE_SCAN_REQUIRE_REAL = "true";
    delete process.env.MALWARE_SCAN_ALLOW_NOOP;
    expect(
      toDocumentScanStatus({
        status: "CLEAN",
        provider: "noop",
        scannedAt: new Date().toISOString(),
      }),
    ).toBe("SCAN_FAILED");
    delete process.env.MALWARE_SCAN_REQUIRE_REAL;

    expect(isDocumentUsableForReadiness("CLEAN")).toBe(true);
    expect(isDocumentUsableForReadiness("PENDING_SCAN")).toBe(false);
    expect(isDocumentDownloadBlocked("INFECTED")).toBe(true);
  });

  it("supports injected malware providers for clean/infected/error", async () => {
    const infected: MalwareScanProvider = {
      name: "test",
      async scan() {
        return {
          status: "INFECTED",
          provider: "test",
          scannedAt: new Date().toISOString(),
          details: "eicar",
        };
      },
    };
    setMalwareScanProviderForTests(infected);
    const r = await infected.scan({
      filename: "x.txt",
      contentType: "text/plain",
      body: Buffer.from("x"),
    });
    expect(r.status).toBe("INFECTED");

    setMalwareScanProviderForTests(new NoopMalwareScanProvider());
    const clean = await new NoopMalwareScanProvider().scan();
    expect(clean.status).toBe("CLEAN");
    expect(clean.details).toMatch(/bypassed/i);
  });

  it("cleans up storage after simulated upload+delete health cycle", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cc-storage-"));
    try {
      const storage = new LocalDocumentStorage(dir);
      const key = "__health__/probe.txt";
      await storage.upload({
        storageKey: key,
        body: Buffer.from("ok"),
        contentType: "text/plain",
      });
      expect(await storage.getMetadata(key)).not.toBeNull();
      await storage.delete(key);
      expect(await storage.getMetadata(key)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects overlapping watcher leases", async () => {
    const first = await acquireJobLease({ ttlSeconds: 60 });
    expect(first.acquired).toBe(true);
    const second = await acquireJobLease({ ttlSeconds: 60 });
    expect(second.acquired).toBe(false);
    await releaseJobLease({ ownerId: first.ownerId });
    const third = await acquireJobLease({ ttlSeconds: 60 });
    expect(third.acquired).toBe(true);
    await releaseJobLease({ ownerId: third.ownerId });
  });

  it("tracks watcher health freshness", () => {
    expect(isWatcherStale(1)).toBe(true);
    recordWatcherSuccess(12, { activeExecutions: 0 });
    expect(getWatcherHealth().lastSucceededAt).toBeTruthy();
    expect(isWatcherStale(3600)).toBe(false);
  });

  it("live health does not require dependencies", async () => {
    const live = await checkLive();
    expect(live.status).toBe("live");
  });

  it("labels demo malware bypass explicitly in readiness", async () => {
    process.env.MALWARE_SCAN_PROVIDER = "noop";
    process.env.MALWARE_SCAN_ALLOW_NOOP = "true";
    resetMalwareScanProviderForTests();
    const { report } = await checkReady();
    expect(report.components.malwareScanner).toBe("development");
    expect(report.details?.malwareMode).toBe("DEMO_BYPASS");
    expect(String(report.details?.malwareNote)).toMatch(/DEMO ONLY/i);
    expect(report.components.ais).toBe("development");
  });

  it("treats missing DATABASE_URL as demo persistence, not a blocker", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.COMMERCIAL_PERSISTENCE;
    process.env.COMMERCIAL_STORE = "memory";
    process.env.DEMO_MODE = "true";
    const { report, httpStatus } = await checkReady();
    expect(httpStatus).toBe(200);
    expect(report.status).not.toBe("not_ready");
    expect(report.components.database).toBe("development");
    expect(report.details?.persistence).toBe("DEMO");
    expect(report.details?.postgresql).toBe("DEFERRED");
    expect(report.details?.durability).toBe("non-production");
    expect(report.details?.persistenceProvider).toBe("memory");
  });

  it("refuses demo reset when DATABASE_URL is set", async () => {
    process.env.DEMO_MODE = "true";
    process.env.DATABASE_URL = "postgres://example.invalid/db";
    process.env.COMMERCIAL_STORE = "memory";
    const { resetDemoCommercialStore } = await import(
      "@/server/commercial/repos"
    );
    await expect(resetDemoCommercialStore()).rejects.toThrow(/DATABASE_URL/);
    delete process.env.DATABASE_URL;
  });

  it("ready health returns structured component map", async () => {
    const { report, httpStatus } = await checkReady();
    expect(httpStatus).toBeGreaterThanOrEqual(200);
    expect(report.components.database).toBeTruthy();
    expect(report.components.storage).toBeTruthy();
    expect(report.components.ais).toMatch(/development|configured/);
  });

  it("keeps AIS in development mode by default", () => {
    delete process.env.AIS_PROVIDER_MODE;
    expect(getAisProviderMode()).toBe("development");
    expect(getAisProviderLabel()).toMatch(/Development/i);
  });

  it("generates opaque request ids and accepts well-formed ones", () => {
    const gen = resolveIncomingRequestId(null);
    expect(gen.startsWith("req_")).toBe(true);
    const kept = resolveIncomingRequestId("req_abcdef0123456789");
    expect(kept).toBe("req_abcdef0123456789");
    const rejected = resolveIncomingRequestId("DROP TABLE;");
    expect(rejected.startsWith("req_")).toBe(true);
  });

  it("enforceRateLimit login policy eventually blocks", async () => {
    const id = hashRateLimitIdentity(`test-${Date.now()}`);
    let blocked = false;
    for (let i = 0; i < 15; i++) {
      const r = await enforceRateLimit({
        policy: "login",
        identityParts: [id],
      });
      if (!r.allowed) {
        blocked = true;
        expect(r.retryAfterSeconds).toBeGreaterThan(0);
        break;
      }
    }
    expect(blocked).toBe(true);
  });
});

describe("rate limit failure policy", () => {
  it("documents search fail-open vs internal fail-closed policies", async () => {
    const { RATE_LIMIT_POLICIES } = await import("@/server/ops/rateLimit");
    expect(RATE_LIMIT_POLICIES.search.onRedisFailure).toBe("open");
    expect(RATE_LIMIT_POLICIES.internal_job.onRedisFailure).toBe("closed");
    expect(RATE_LIMIT_POLICIES.login.onRedisFailure).toBe("memory");
  });
});
