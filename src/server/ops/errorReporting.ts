import { logger } from "@/server/ops/logger";

export interface ErrorReportingProvider {
  readonly name: string;
  captureException(error: unknown, context?: Record<string, unknown>): void;
}

class LogErrorReporter implements ErrorReportingProvider {
  readonly name = "log";
  captureException(error: unknown, context?: Record<string, unknown>): void {
    logger.error("error.reported", {
      message: error instanceof Error ? error.message : String(error),
      ...context,
    });
  }
}

/** Optional Sentry-shaped reporter when SENTRY_DSN is set (lazy, no hard dependency). */
class SentryErrorReporter implements ErrorReportingProvider {
  readonly name = "sentry";
  captureException(error: unknown, context?: Record<string, unknown>): void {
    // Soft integration: log + optional global hook without requiring @sentry/node at build time.
    const g = globalThis as {
      __cargoConnectSentry?: {
        captureException: (e: unknown, ctx?: Record<string, unknown>) => void;
      };
    };
    if (g.__cargoConnectSentry?.captureException) {
      g.__cargoConnectSentry.captureException(error, context);
      return;
    }
    logger.error("error.sentry_fallback", {
      message: error instanceof Error ? error.message : String(error),
      hint: "Set SENTRY_DSN and register global reporter, or rely on structured logs",
      ...context,
    });
  }
}

let cached: ErrorReportingProvider | null = null;

export function getErrorReporter(): ErrorReportingProvider {
  if (cached) return cached;
  if (process.env.SENTRY_DSN?.trim()) {
    cached = new SentryErrorReporter();
  } else {
    cached = new LogErrorReporter();
  }
  return cached;
}

export function resetErrorReporterForTests(): void {
  cached = null;
}
