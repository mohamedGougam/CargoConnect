/**
 * One-shot readiness probe for demo activation. Never prints secrets.
 * Usage: npx tsx scripts/demo-ready-probe.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  process.env.MALWARE_SCAN_PROVIDER ??= "noop";
  process.env.MALWARE_SCAN_ALLOW_NOOP ??= "true";
  process.env.COMMERCIAL_STORE ??= "memory";
  process.env.DEMO_MODE ??= "true";
  // Presentation demo intentionally omits Postgres
  delete process.env.DATABASE_URL;
  delete process.env.COMMERCIAL_PERSISTENCE;

  const { resetMalwareScanProviderForTests } = await import(
    "../src/server/ops/malware"
  );
  const { resetRateLimitProviderForTests } = await import(
    "../src/server/ops/rateLimit"
  );
  resetMalwareScanProviderForTests();
  resetRateLimitProviderForTests();

  const { checkLive, checkReady } = await import("../src/server/ops/health");
  const live = await checkLive();
  const { report, httpStatus } = await checkReady();

  console.log(
    JSON.stringify(
      {
        live,
        httpStatus,
        status: report.status,
        components: report.components,
        details: {
          persistence: report.details?.persistence,
          persistenceProvider: report.details?.persistenceProvider,
          postgresql: report.details?.postgresql,
          durability: report.details?.durability,
          malwareMode: report.details?.malwareMode,
          malwareNote: report.details?.malwareNote,
          malwareProvider: report.details?.malwareProvider,
          emailMode: report.details?.emailMode,
          emailDelivery: report.details?.emailDelivery,
          inboundEmailEnabled: report.details?.inboundEmailEnabled,
          aisLabel: report.details?.aisLabel,
          rateLimitProvider: report.details?.rateLimitProvider,
          storageProvider: report.details?.storageProvider,
          cronNote: report.details?.cronNote,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
