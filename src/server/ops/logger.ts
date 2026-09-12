import { getRequestId } from "@/server/ops/correlation";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  event: string;
  level?: LogLevel;
  requestId?: string;
  userId?: string | null;
  bookingId?: string | null;
  commercialRequestId?: string | null;
  shipmentExecutionId?: string | null;
  provider?: string | null;
  durationMs?: number;
  status?: string | number | null;
  code?: string | null;
  [key: string]: unknown;
}

const REDACT_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "authorization",
  "cookie",
  "secret",
  "apiKey",
  "accessKey",
  "secretKey",
  "body",
  "rawBody",
  "emailBody",
  "content",
]);

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.has(k) || /secret|password|token|cookie|authorization/i.test(k)) {
      out[k] = "[redacted]";
    } else {
      out[k] = sanitize(v, depth + 1);
    }
  }
  return out;
}

export function log(fields: LogFields): void {
  const level = fields.level ?? "info";
  const payload = sanitize({
    timestamp: new Date().toISOString(),
    level,
    requestId: fields.requestId ?? getRequestId() ?? undefined,
    service: "cargo-connect",
    ...fields,
  });
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  debug: (event: string, fields: Omit<LogFields, "event" | "level"> = {}) =>
    log({ ...fields, event, level: "debug" }),
  info: (event: string, fields: Omit<LogFields, "event" | "level"> = {}) =>
    log({ ...fields, event, level: "info" }),
  warn: (event: string, fields: Omit<LogFields, "event" | "level"> = {}) =>
    log({ ...fields, event, level: "warn" }),
  error: (event: string, fields: Omit<LogFields, "event" | "level"> = {}) =>
    log({ ...fields, event, level: "error" }),
};
