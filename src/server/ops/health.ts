import { hasDatabaseUrl, getDb } from "@/server/db/client";
import { getDocumentStorage } from "@/server/documents/storage";
import { getRateLimitProvider } from "@/server/ops/rateLimit";
import { getMalwareScanProvider, allowNoopMalwareInEnvironment } from "@/server/ops/malware";
import { getAisProviderMode, getAisProviderLabel } from "@/server/ops/aisMode";
import {
  getWatcherHealth,
  isWatcherStale,
} from "@/server/ops/jobLock";
import {
  getCommercialPersistenceMode,
  isDemoPersistenceMode,
} from "@/server/commercial/repos";
import { getPortCatalogueDiagnostics } from "@/lib/search/catalogueHealth";
import { sql } from "drizzle-orm";

export type ComponentStatus =
  | "ok"
  | "configured"
  | "development"
  | "degraded"
  | "unavailable"
  | "not_configured"
  | "error";

export interface ReadinessReport {
  status: "ready" | "not_ready" | "degraded";
  checkedAt: string;
  components: Record<string, ComponentStatus | string>;
  details?: Record<string, unknown>;
}

export async function checkLive(): Promise<{ status: "live"; timestamp: string }> {
  return { status: "live", timestamp: new Date().toISOString() };
}

export async function checkReady(): Promise<{
  report: ReadinessReport;
  httpStatus: number;
}> {
  const components: Record<string, ComponentStatus> = {};
  const details: Record<string, unknown> = {};
  let essentialFailed = false;

  // Persistence (Postgres deferred for demo when memory mode is selected)
  const persistenceMode = getCommercialPersistenceMode();
  details.persistenceProvider = persistenceMode;
  if (persistenceMode === "postgres" || process.env.COMMERCIAL_PERSISTENCE === "postgres") {
    try {
      if (!hasDatabaseUrl()) {
        components.database = "not_configured";
        details.persistence = "BLOCKED";
        details.postgresql = "REQUIRED_BUT_MISSING";
        essentialFailed = true;
      } else {
        const db = getDb();
        await db.execute(sql`select 1`);
        components.database = "ok";
        details.persistence = "POSTGRES";
        details.postgresql = "CONNECTED";
        details.durability = "provider-backed";
      }
    } catch (err) {
      components.database = "error";
      details.database = err instanceof Error ? err.message : "db_error";
      details.persistence = "ERROR";
      details.postgresql = "ERROR";
      essentialFailed = true;
    }
  } else {
    // Intentional demo / presentation mode — absence of DATABASE_URL is not a blocker
    components.database = "development";
    details.persistence = "DEMO";
    details.postgresql = "DEFERRED";
    details.durability = "non-production";
    details.databaseMode = "memory";
    details.persistenceNote =
      "In-memory commercial repositories — cleared on process restart, crash, or Render redeploy. Not for customer records.";
  }
  details.demoPersistence = isDemoPersistenceMode();

  // Storage
  try {
    const storage = getDocumentStorage();
    const key = `__health__/ready-${Date.now()}.txt`;
    const body = Buffer.from("ok", "utf8");
    await storage.upload({
      storageKey: key,
      body,
      contentType: "text/plain",
    });
    const meta = await storage.getMetadata(key);
    await storage.delete(key);
    components.storage = meta ? "ok" : "degraded";
    details.storageProvider = storage.name;
  } catch (err) {
    components.storage =
      process.env.NODE_ENV === "production" ? "error" : "degraded";
    details.storage = err instanceof Error ? err.message : "storage_error";
    if (process.env.DOCUMENT_STORAGE_PROVIDER === "s3") {
      essentialFailed = true;
    }
  }

  // Email config (do not send)
  const emailKey = process.env.EMAIL_API_KEY?.trim();
  const emailMode = (process.env.EMAIL_DELIVERY_MODE ?? "log").trim().toLowerCase();
  details.emailMode = emailMode;
  if (emailMode === "log") {
    components.email = "configured";
    details.emailDelivery = "DELIVERY_SIMULATED";
  } else if (emailMode === "live" && emailKey) {
    components.email = "configured";
    details.emailDelivery = "live";
  } else {
    components.email = "not_configured";
    details.emailDelivery = "misconfigured";
  }

  const inboundOn =
    (process.env.EMAIL_INBOUND_ENABLED ?? "").trim().toLowerCase() === "true";
  details.inboundEmailEnabled = inboundOn;
  if (inboundOn) {
    const inboundDomain =
      process.env.EMAIL_INBOUND_DOMAIN?.trim() ||
      process.env.EMAIL_REPLY_DOMAIN?.trim();
    const webhookSecret =
      process.env.EMAIL_WEBHOOK_SECRET?.trim() ||
      process.env.RESEND_WEBHOOK_SECRET?.trim();
    components.inboundEmail =
      inboundDomain && webhookSecret ? "configured" : "not_configured";
  } else {
    components.inboundEmail = "not_configured";
  }

  // Rate limit
  try {
    const rl = getRateLimitProvider();
    const ok = rl.ping ? await rl.ping() : true;
    components.rateLimit = ok ? "ok" : "degraded";
    details.rateLimitProvider = rl.name;
  } catch {
    components.rateLimit = "degraded";
  }

  // Malware
  try {
    const scanner = getMalwareScanProvider();
    const ok = scanner.ping ? await scanner.ping() : true;
    if (scanner.name === "noop") {
      const demoBypass = allowNoopMalwareInEnvironment();
      components.malwareScanner = demoBypass ? "development" : "unavailable";
      details.malwareMode = demoBypass ? "DEMO_BYPASS" : "NOOP_BLOCKED";
      details.malwareNote = demoBypass
        ? "DEMO ONLY — malware scanning bypassed (noop). Not real protection. Pre-production: deploy HTTP/ClamAV scanner and remove MALWARE_SCAN_ALLOW_NOOP."
        : "Noop scanner without allow — uploads will not be marked CLEAN";
    } else {
      components.malwareScanner = ok ? "ok" : "unavailable";
      details.malwareMode = ok ? "http" : "http_unavailable";
      details.malwareNote = ok
        ? "Uploads are scanned via HTTP malware provider"
        : "HTTP malware scanner unreachable";
    }
    details.malwareProvider = scanner.name;
  } catch {
    components.malwareScanner = "error";
    details.malwareMode = "error";
  }

  // AIS
  const aisMode = getAisProviderMode();
  components.ais = aisMode === "licensed" ? "configured" : "development";
  details.aisLabel = getAisProviderLabel();

  // Port search catalogue (detect accidental fixture deployment)
  const catalogue = getPortCatalogueDiagnostics();
  details.portCatalogue = {
    kind: catalogue.kind,
    totalPorts: catalogue.totalPorts,
    totalCountries: catalogue.totalCountries,
    incomplete: catalogue.incomplete,
    code: catalogue.code,
  };
  components.portCatalogue = catalogue.incomplete ? "degraded" : "ok";
  if (catalogue.incomplete) {
    details.portCatalogueCode = "PORT_CATALOGUE_INCOMPLETE";
    details.portCatalogueMessage = catalogue.message;
  }

  // Watcher freshness
  const health = getWatcherHealth();
  const interval = Number(
    process.env.SHIPMENT_OBSERVATION_INTERVAL_SECONDS ?? "300",
  );
  const staleAfter = Math.max(interval * 3, 900);
  if (!health.lastSucceededAt) {
    components.shipmentWatcher = "not_configured";
    details.cronNote =
      "Optional for interactive demo — configure Render cron when background AIS observation is needed";
  } else if (isWatcherStale(staleAfter)) {
    components.shipmentWatcher = "degraded";
    details.watcher = health;
  } else {
    components.shipmentWatcher = "ok";
    details.watcher = {
      lastSucceededAt: health.lastSucceededAt,
      lastDurationMs: health.lastDurationMs,
    };
  }

  const status: ReadinessReport["status"] = essentialFailed
    ? "not_ready"
    : Object.values(components).some(
          (c) => c === "degraded" || c === "unavailable" || c === "error",
        )
      ? "degraded"
      : "ready";

  const report: ReadinessReport = {
    status: essentialFailed ? "not_ready" : status === "degraded" ? "degraded" : "ready",
    checkedAt: new Date().toISOString(),
    components,
    details,
  };

  return {
    report,
    httpStatus: essentialFailed ? 503 : 200,
  };
}
