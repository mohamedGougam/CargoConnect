import { NextResponse } from "next/server";
import { readSessionUser } from "@/server/commercial/auth";
import type { BookingDocumentType } from "@/domain/commercial/types";
import { uploadBookingDocument } from "@/server/documents/uploadDocument";
import { assertTrustedOrigin } from "@/server/ops/csrf";
import {
  enforceRateLimit,
  hashRateLimitIdentity,
} from "@/server/ops/rateLimit";
import { rateLimitedResponse } from "@/server/ops/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: BookingDocumentType[] = [
  "COMMERCIAL_INVOICE",
  "PACKING_LIST",
  "CARGO_MANIFEST",
  "BILL_OF_LADING_INSTRUCTIONS",
  "CERTIFICATE_OF_ORIGIN",
  "DANGEROUS_GOODS_DECLARATION",
  "CARGO_DIMENSIONS",
  "INSURANCE_CERTIFICATE",
  "EXPORT_DOCUMENTATION",
  "CUSTOMS_DOCUMENTATION",
  "MSDS",
  "LETTER_OF_AUTHORIZATION",
  "OTHER",
];

/** POST multipart upload */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const originCheck = assertTrustedOrigin(request);
  if (!originCheck.ok) {
    return NextResponse.json(
      { error: originCheck.error, code: originCheck.code },
      { status: 403 },
    );
  }

  const rl = await enforceRateLimit({
    policy: "upload",
    identityParts: [hashRateLimitIdentity(user.id)],
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds);

  const { id } = await context.params;
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form" }, { status: 400 });
  }

  const file = form.get("file");
  const documentType = String(form.get("documentType") ?? "");
  const requirementId = form.get("requirementId")
    ? String(form.get("requirementId"))
    : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (!TYPES.includes(documentType as BookingDocumentType)) {
    return NextResponse.json({ error: "Invalid documentType" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const result = await uploadBookingDocument({
    bookingId: id,
    userId: user.id,
    requirementId,
    documentType: documentType as BookingDocumentType,
    filename: file.name || "document",
    contentType: file.type || "application/octet-stream",
    body: buf,
  });

  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "invalid_type" ||
            result.code === "oversized" ||
            result.code === "empty_file"
          ? 400
          : result.code === "storage_unavailable" || result.code === "db_unavailable"
            ? 503
            : 409;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({
    document: result.document,
    replaced: result.replaced ?? false,
  });
}
