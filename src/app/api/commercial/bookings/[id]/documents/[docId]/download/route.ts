import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { getDocumentStorage } from "@/server/documents/storage";
import { getRepositories } from "@/server/commercial/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET authenticated document download — no public URLs */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id, docId } = await context.params;
  const repos = getRepositories();
  const booking = await repos.bookings.get(id);
  if (!booking || booking.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const doc = await repos.bookingDocuments.get(docId);
  if (!doc || doc.bookingId !== booking.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (doc.scanStatus === "INFECTED" || doc.quarantined) {
    return NextResponse.json(
      {
        error: {
          code: "DOCUMENT_INFECTED",
          message: "This file is blocked and cannot be downloaded",
        },
      },
      { status: 403 },
    );
  }

  // Reject arbitrary key probing — only stored server key
  if (
    !doc.storageKey.startsWith(`bookings/${booking.id}/`) &&
    !doc.storageKey.startsWith(`quarantine/${booking.id}/`)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stored = await getDocumentStorage().download(doc.storageKey);
  if (!stored) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(stored.body), {
    status: 200,
    headers: {
      "Content-Type": stored.contentType || doc.contentType,
      "Content-Disposition": `attachment; filename="${doc.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
