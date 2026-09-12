import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getRepositories } from "@/server/commercial/repos";
import { detectNewerDocumentsThanHandoff } from "@/server/handoff/buildHandoff";
import { createOrRegenerateHandoff } from "@/server/handoff/createHandoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — list handoffs + latest for booking */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(id)) ?? (await repos.bookings.getByReference(id));
  if (!booking || booking.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const handoffs = await repos.handoffs.listForBooking(booking.id);
  const latest = handoffs[0] ?? null;
  const newerDocuments = latest
    ? await detectNewerDocumentsThanHandoff(latest)
    : false;

  return NextResponse.json({
    booking: {
      id: booking.id,
      bookingReference: booking.bookingReference,
      status: booking.status,
      origin: booking.origin,
      destination: booking.destination,
    },
    handoffs: handoffs.map((h) => ({
      id: h.id,
      handoffReference: h.handoffReference,
      status: h.status,
      version: h.version,
      generatedAt: h.generatedAt,
      finalizedAt: h.finalizedAt ?? null,
    })),
    latest,
    newerDocumentsThanLatest: newerDocuments,
    disclaimer:
      "CargoConnect operational summary — not a bill of lading, customs declaration, or carrier-issued booking confirmation.",
  });
}

/** POST — create or regenerate handoff draft */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const repos = getRepositories();
  const booking =
    (await repos.bookings.get(id)) ?? (await repos.bookings.getByReference(id));
  if (!booking || booking.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    forceNewVersion?: boolean;
    operationsContactName?: string | null;
    operationsContactEmail?: string | null;
    operationsContactPhone?: string | null;
    operationalNotes?: string | null;
  };

  const result = await createOrRegenerateHandoff({
    bookingId: booking.id,
    userId: user.id,
    forceNewVersion: body.forceNewVersion === true,
    operationsContactName: body.operationsContactName,
    operationsContactEmail: body.operationsContactEmail,
    operationsContactPhone: body.operationsContactPhone,
    operationalNotes: body.operationalNotes,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      {
        status:
          result.code === "not_found"
            ? 404
            : result.code === "HANDOFF_NOT_READY"
              ? 409
              : 400,
      },
    );
  }

  return NextResponse.json({
    handoff: result.handoff,
    regenerated: result.regenerated ?? false,
    newVersion: result.newVersion ?? false,
  });
}
