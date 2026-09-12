import type { Port, Vessel } from "@/domain/models";
import type { RouteSearchState } from "@/domain/search/types";
import type { PendingCommercialIntent } from "@/domain/commercial/types";

const STORAGE_KEY = "cc_pending_commercial_intent";

export type CommercialWorkflow = PendingCommercialIntent["workflow"];

export function createPendingIntent(input: {
  workflow: CommercialWorkflow;
  search: RouteSearchState;
  selectedVessel?: Vessel | null;
  selectedPort?: Port | null;
}): PendingCommercialIntent {
  return {
    id: `intent_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    workflow: input.workflow,
    search: input.search,
    selectedVessel: input.selectedVessel ?? null,
    selectedPort: input.selectedPort ?? null,
    createdAt: new Date().toISOString(),
  };
}

export function savePendingIntentLocal(intent: PendingCommercialIntent): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
}

export function loadPendingIntentLocal(): PendingCommercialIntent | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingCommercialIntent;
  } catch {
    return null;
  }
}

export function clearPendingIntentLocal(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function workflowPath(workflow: CommercialWorkflow): string {
  if (workflow === "price") return "/commercial/price";
  if (workflow === "quote") return "/commercial/quote";
  return "/commercial/reservation";
}

/**
 * Start a commercial workflow: persist intent, then auth gate or continue.
 */
export async function startCommercialWorkflow(input: {
  workflow: CommercialWorkflow;
  search: RouteSearchState;
  selectedVessel?: Vessel | null;
  selectedPort?: Port | null;
}): Promise<void> {
  const intent = createPendingIntent(input);
  savePendingIntentLocal(intent);

  // Mirror to server so auth redirect can recover if sessionStorage is cleared
  try {
    await fetch("/api/commercial/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intent),
    });
  } catch {
    // Local intent is enough for same-tab flow
  }

  const me = await fetch("/api/auth/me").then((r) => r.json()).catch(() => null);
  const path = `${workflowPath(input.workflow)}?intent=${encodeURIComponent(intent.id)}`;

  if (me?.user) {
    // Hard navigation required so middleware sees the session cookie.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full page handoff after auth gate
    window.location.assign(path);
    return;
  }

  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full page handoff to auth
  window.location.assign(`/auth?next=${encodeURIComponent(path)}`);
}
