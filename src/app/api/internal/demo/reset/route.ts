import { NextResponse } from "next/server";
import { safeEqual } from "@/server/commercial/auth";
import {
  resetDemoCommercialStore,
  getCommercialPersistenceMode,
} from "@/server/commercial/repos";
import {
  resolveIncomingRequestId,
  runWithRequestIdAsync,
  REQUEST_ID_HEADER,
} from "@/server/ops/correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Clear in-memory demo commercial state.
 * Requires DEMO_MODE=true and Authorization: Bearer <DEMO_RESET_SECRET|INTERNAL_OPS_SECRET>.
 * Hard-refuses when DATABASE_URL / postgres persistence is configured.
 */
export async function POST(request: Request) {
  const requestId = resolveIncomingRequestId(
    request.headers.get(REQUEST_ID_HEADER),
  );
  return runWithRequestIdAsync(requestId, async () => {
    if ((process.env.DEMO_MODE ?? "").trim().toLowerCase() !== "true") {
      return NextResponse.json(
        {
          error: {
            code: "DEMO_MODE_REQUIRED",
            message: "Demo reset requires DEMO_MODE=true",
            requestId,
          },
        },
        { status: 403, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }

    const secret =
      process.env.DEMO_RESET_SECRET?.trim() ||
      process.env.INTERNAL_OPS_SECRET?.trim();
    if (!secret || secret.length < 16) {
      return NextResponse.json(
        {
          error: {
            code: "RESET_SECRET_MISSING",
            message: "DEMO_RESET_SECRET or INTERNAL_OPS_SECRET not configured",
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

    try {
      const result = await resetDemoCommercialStore();
      return NextResponse.json(
        {
          ...result,
          persistenceMode: getCommercialPersistenceMode(),
          note: "In-memory commercial state cleared; curated contacts reseeded. R2 objects and Redis keys are unchanged.",
        },
        { headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    } catch (err) {
      return NextResponse.json(
        {
          error: {
            code: "DEMO_RESET_REFUSED",
            message: err instanceof Error ? err.message : "reset_refused",
            requestId,
          },
        },
        { status: 409, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }
  });
}
