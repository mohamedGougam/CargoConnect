import { NextResponse } from "next/server";
import { runShipmentObservationWatcher } from "@/server/execution/observationWatcher";
import { safeEqual } from "@/server/commercial/auth";
import {
  acquireJobLease,
  releaseJobLease,
  recordWatcherStart,
  recordWatcherSuccess,
  recordWatcherFailure,
  getWatcherHealth,
} from "@/server/ops/jobLock";
import {
  enforceRateLimit,
  hashRateLimitIdentity,
} from "@/server/ops/rateLimit";
import { rateLimitedResponse } from "@/server/ops/errors";
import {
  resolveIncomingRequestId,
  runWithRequestIdAsync,
  REQUEST_ID_HEADER,
} from "@/server/ops/correlation";
import { logger } from "@/server/ops/logger";
import { metrics } from "@/server/ops/metrics";
import { getAisProviderLabel } from "@/server/ops/aisMode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Protected observation watcher job for Render cron / scheduler.
 * Authorization: Authorization: Bearer <SHIPMENT_OBSERVATION_JOB_SECRET>
 */
export async function POST(request: Request) {
  const requestId = resolveIncomingRequestId(
    request.headers.get(REQUEST_ID_HEADER),
  );
  return runWithRequestIdAsync(requestId, async () => {
    const secret = process.env.SHIPMENT_OBSERVATION_JOB_SECRET?.trim();
    if (!secret || secret.length < 16) {
      return NextResponse.json(
        {
          error: {
            code: "JOB_SECRET_MISSING",
            message: "Job secret not configured",
            requestId,
          },
        },
        { status: 503, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }

    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || !safeEqual(token, secret)) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized", requestId } },
        { status: 401, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }

    const rl = await enforceRateLimit({
      policy: "internal_job",
      identityParts: [hashRateLimitIdentity("shipment_observation")],
    });
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds);

    const lease = await acquireJobLease({ ttlSeconds: 240 });
    if (!lease.acquired) {
      logger.info("ais.watcher_lease_busy", {
        event: "ais.watcher_lease_busy",
        requestId,
      });
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "lease_held",
          health: getWatcherHealth(),
          aisMode: getAisProviderLabel(),
        },
        { headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }

    const started = Date.now();
    recordWatcherStart();
    metrics.aisJobRun();
    try {
      const summary = await runShipmentObservationWatcher();
      const durationMs = Date.now() - started;
      if (!summary.providerAvailable) metrics.aisProviderUnavailable();
      metrics.aisIngested(summary.observationsIngested);
      metrics.aisSkipped(summary.observationsSkipped);
      recordWatcherSuccess(durationMs, { ...summary });
      logger.info("ais.watcher_ok", {
        event: "ais.watcher_ok",
        durationMs,
        activeExecutions: summary.activeExecutions,
        ingested: summary.observationsIngested,
      });
      return NextResponse.json(
        {
          ok: true,
          ...summary,
          durationMs,
          health: getWatcherHealth(),
          aisMode: getAisProviderLabel(),
        },
        { headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    } catch (err) {
      const durationMs = Date.now() - started;
      recordWatcherFailure(durationMs, {
        error: err instanceof Error ? err.message : "failed",
      });
      logger.error("ais.watcher_failed", {
        event: "ais.watcher_failed",
        durationMs,
        message: err instanceof Error ? err.message : "failed",
      });
      return NextResponse.json(
        {
          error: {
            code: "WATCHER_FAILED",
            message: "Observation watcher failed",
            requestId,
          },
        },
        { status: 500, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    } finally {
      await releaseJobLease({ ownerId: lease.ownerId });
    }
  });
}
