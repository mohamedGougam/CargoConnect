import { AsyncLocalStorage } from "async_hooks";
import { randomBytes } from "crypto";

interface CorrelationStore {
  requestId: string;
}

const als = new AsyncLocalStorage<CorrelationStore>();

export function generateRequestId(): string {
  return `req_${randomBytes(12).toString("hex")}`;
}

/** Accept only well-formed opaque IDs from trusted internal callers. */
export function resolveIncomingRequestId(headerValue: string | null): string {
  const raw = headerValue?.trim() ?? "";
  if (/^req_[a-f0-9]{16,64}$/i.test(raw) || /^[a-f0-9-]{8,64}$/i.test(raw)) {
    return raw.slice(0, 64);
  }
  return generateRequestId();
}

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return als.run({ requestId }, fn);
}

export async function runWithRequestIdAsync<T>(
  requestId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return als.run({ requestId }, fn);
}

export function getRequestId(): string | undefined {
  return als.getStore()?.requestId;
}

export const REQUEST_ID_HEADER = "x-request-id";
