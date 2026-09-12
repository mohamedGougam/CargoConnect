import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import { reviewDocumentWarning } from "@/server/documents/uploadDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST mark document warning reviewed */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id, docId } = await context.params;
  const result = await reviewDocumentWarning({
    bookingId: id,
    documentId: docId,
    userId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.code === "not_found" ? 404 : 400 },
    );
  }

  return NextResponse.json({ document: result.document });
}
